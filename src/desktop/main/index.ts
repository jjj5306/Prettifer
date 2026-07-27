import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  type HeadersReceivedResponse,
} from "electron";

import { CompositeDiffCoordinator } from "../../composition/composite-diff-coordinator.js";
import { CompositeDiffService } from "../../composition/composite-diff-service.js";
import { GitCommandRunner } from "../../git/git-command-runner.js";
import { RepositoryHistoryService } from "../../history/repository-history-service.js";
import { DesktopCompositionController } from "./desktop-composition-controller.js";
import { createDesktopRequestHandlers } from "./desktop-request-handlers.js";
import {
  createFolderSelectionBoundary,
  e2eCompositionDelay,
  e2eGitPath,
} from "./e2e-boundary.js";
import {
  registerDesktopRequestHandlers,
  removeDesktopRequestHandlers,
} from "./ipc-registration.js";
import {
  RepositorySessionController,
  RepositorySessionManager,
} from "./repository-session.js";
import {
  applyContentSecurityPolicy,
  configurePermissionGuards,
  configureWindowGuards,
  createMainWindowOptions,
} from "./window-security.js";

let mainWindow: BrowserWindow | undefined;

app.enableSandbox();

void app.whenReady().then(() => {
  configureSessionSecurity();
  return startApplicationWindow();
}).catch((error: unknown) => {
  console.error("Prettifer 시작에 실패했습니다.", error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

function configureSessionSecurity(): void {
  configurePermissionGuards({
    setPermissionCheckHandler: (handler) => {
      session.defaultSession.setPermissionCheckHandler(() => handler());
    },
    setPermissionRequestHandler: (handler) => {
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        handler(webContents, permission, callback);
      });
    },
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    applyContentSecurityPolicy(!app.isPackaged, details, (override) => {
      callback(override as HeadersReceivedResponse);
    }, MAIN_WINDOW_WEBPACK_ENTRY);
  });
}

async function startApplicationWindow(): Promise<void> {
  const window = new BrowserWindow(createMainWindowOptions(MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY));
  const lifetime = new AbortController();
  mainWindow = window;
  configureWindowGuards(window.webContents, MAIN_WINDOW_WEBPACK_ENTRY);

  const gitPath = e2eGitPath(process.env);
  const git = new GitCommandRunner(gitPath === undefined ? {} : { gitPath });
  const history = new RepositoryHistoryService(git);
  const composition = new DesktopCompositionController(
    history,
    new CompositeDiffCoordinator(new CompositeDiffService(git)),
    e2eCompositionDelay(process.env),
    lifetime.signal,
  );
  const sessions = new RepositorySessionManager(
    history,
    undefined,
    undefined,
    () => { composition.dispose(); },
  );
  const folders = createFolderSelectionBoundary({
    show: async () => {
      const result = await dialog.showOpenDialog(window, {
        properties: ["openDirectory"],
        title: "Prettifer에서 열 Git 저장소 선택",
      });
      return result;
    },
  }, process.env);
  const repositoryController = new RepositorySessionController(
    sessions,
    folders,
    lifetime.signal,
  );
  const handlers = createDesktopRequestHandlers({
    trustedWindow: () => mainWindow === window && !window.isDestroyed()
      ? { senderId: window.webContents.id, frameUrl: MAIN_WINDOW_WEBPACK_ENTRY }
      : undefined,
    sessions,
    repositoryController,
    history,
    composition,
    signal: lifetime.signal,
  });
  registerDesktopRequestHandlers(ipcMain, handlers);

  window.once("ready-to-show", () => {
    window.show();
  });
  window.once("closed", () => {
    lifetime.abort();
    composition.dispose();
    sessions.clear();
    removeDesktopRequestHandlers(ipcMain);
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });
  try {
    await window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  } catch (error) {
    window.destroy();
    throw error;
  }
}
