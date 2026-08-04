import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { IpcMain } from "electron";

import { CompositeDiffCoordinator } from "../../composition/composite-diff-coordinator.js";
import { CompositeDiffService } from "../../composition/composite-diff-service.js";
import { GitCommandRunner } from "../../git/git-command-runner.js";
import { RepositoryHistoryService } from "../../history/repository-history-service.js";
import { BaseTreeLister } from "../../base-tree/base-tree-lister.js";
import { BaseFileReader } from "../../symbols/base-file-reader.js";
import { SymbolSearchService } from "../../symbols/symbol-search.js";
import { DesktopCompositionController } from "./desktop-composition-controller.js";
import { createDesktopRequestHandlers } from "./desktop-request-handlers.js";
import {
  createGroupingRuleStore,
  unavailableGroupingRuleStore,
  type GroupingRuleStore,
} from "./grouping-rule-store.js";
import {
  registerDesktopRequestHandlers,
  removeDesktopRequestHandlers,
} from "./ipc-registration.js";
import {
  RepositorySessionController,
  RepositorySessionManager,
} from "./repository-session.js";
import { configureWindowGuards } from "./window-security.js";

/**
 * The three points the Electron end-to-end run has to control. Production
 * supplies only a folder dialog; the values that make a test deterministic stay
 * out of the shipped bundle because only the test entry fills them in.
 */
export interface ApplicationSeams {
  /** Resolves the repository the user picked, or null when they cancelled. */
  selectFolder(): Promise<string | null>;
  /** Git executable to run instead of the one on PATH. */
  readonly gitPath?: string;
  /** Awaited before each composition, so a test can observe progress states. */
  beforeComposition?(): Promise<void>;
  /** Repository the app was started with, when the user passed a path. */
  initialRepositoryPath?(): string | null;
  /**
   * File the grouping rules of every repository are kept in. It sits in the
   * application's own settings folder, never inside a repository under review.
   */
  readonly groupingRulesPath?: string;
}

interface ApplicationWebContents {
  readonly id: number;
  setWindowOpenHandler(handler: () => { readonly action: "deny" }): void;
  on(
    event: "will-navigate",
    listener: (event: { preventDefault(): void }, url: string) => void,
  ): void;
}

export interface ApplicationWindow {
  readonly webContents: ApplicationWebContents;
  once(event: "ready-to-show" | "closed", listener: () => void): void;
  show(): void;
  isDestroyed(): boolean;
  destroy(): void;
  loadURL(url: string): Promise<void>;
}

/**
 * Everything the assembly needs from Electron, as a narrow surface so the
 * lifecycle can be verified without launching a browser window.
 */
export interface ApplicationHost {
  createWindow(): ApplicationWindow;
  /** URL the window loads and the only origin treated as trusted. */
  readonly entryUrl: string;
  readonly ipc: Pick<IpcMain, "handle" | "removeHandler">;
}

/**
 * The rules live at a path the entry decided, so nothing a window sends can
 * choose where the application writes.
 */
function groupingRuleStore(filePath: string | undefined): GroupingRuleStore {
  if (filePath === undefined) {
    return unavailableGroupingRuleStore();
  }
  return createGroupingRuleStore(filePath, dirname(filePath), {
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, contents) => writeFile(path, contents, "utf8"),
    makeDirectory: async (path) => {
      await mkdir(path, { recursive: true });
    },
  });
}

/**
 * Creates the window, wires the request handlers to it and releases everything
 * when the window closes. Returns once the window has loaded.
 */
export async function startDesktopApplication(
  host: ApplicationHost,
  seams: ApplicationSeams,
): Promise<ApplicationWindow> {
  const window = host.createWindow();
  const lifetime = new AbortController();
  let current: ApplicationWindow | undefined = window;
  configureWindowGuards(window.webContents, host.entryUrl);

  const git = new GitCommandRunner(
    seams.gitPath === undefined ? {} : { gitPath: seams.gitPath },
  );
  const history = new RepositoryHistoryService(git);
  const composition = new DesktopCompositionController(
    history,
    new CompositeDiffCoordinator(new CompositeDiffService(git)),
    () => seams.beforeComposition?.() ?? Promise.resolve(),
    lifetime.signal,
  );
  const sessions = new RepositorySessionManager(
    history,
    undefined,
    undefined,
    () => { composition.dispose(); },
  );
  const repositoryController = new RepositorySessionController(
    sessions,
    { selectFolder: () => seams.selectFolder() },
    lifetime.signal,
    () => seams.initialRepositoryPath?.() ?? null,
  );
  const handlers = createDesktopRequestHandlers({
    trustedWindow: () => current === window && !window.isDestroyed()
      ? { senderId: window.webContents.id, frameUrl: host.entryUrl }
      : undefined,
    sessions,
    repositoryController,
    history,
    composition,
    symbols: new SymbolSearchService(git),
    baseFiles: new BaseFileReader(git),
    baseTree: new BaseTreeLister(git),
    groupingRules: groupingRuleStore(seams.groupingRulesPath),
    signal: lifetime.signal,
  });
  registerDesktopRequestHandlers(host.ipc, handlers);

  // `destroy` on a failed load also emits "closed", so releasing runs at most
  // once no matter which path gets there first.
  let released = false;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    lifetime.abort();
    composition.dispose();
    sessions.clear();
    removeDesktopRequestHandlers(host.ipc);
    current = undefined;
  };

  window.once("ready-to-show", () => {
    window.show();
  });
  window.once("closed", release);

  try {
    await window.loadURL(host.entryUrl);
  } catch (error) {
    release();
    window.destroy();
    throw error;
  }
  return window;
}
