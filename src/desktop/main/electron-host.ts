import { join } from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  type HeadersReceivedResponse,
} from "electron";

import type { ApplicationHost, ApplicationSeams } from "./desktop-application.js";
import { startDesktopApplication } from "./desktop-application.js";
import {
  applyContentSecurityPolicy,
  configurePermissionGuards,
  createMainWindowOptions,
} from "./window-security.js";

/**
 * The real Electron wiring, shared by the production and the end-to-end entry so
 * neither duplicates the lifecycle or the security configuration. The entries
 * differ only in the seams they pass.
 */
export function createElectronHost(): ApplicationHost {
  return {
    createWindow: () =>
      new BrowserWindow(createMainWindowOptions(MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY)),
    entryUrl: MAIN_WINDOW_WEBPACK_ENTRY,
    ipc: ipcMain,
    appVersion: app.getVersion(),
  };
}

/** The folder dialog the user actually sees. */
export function createFolderDialog(): { show(): Promise<{
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}> } {
  return {
    show: () =>
      dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: "Select a Git repository to open in Prettifer",
      }),
  };
}

/**
 * Boots Electron and starts the application with the given seams. Every entry
 * calls this so sandbox, session security and shutdown stay in one place.
 */
export function runElectronApplication(
  createSeams: () => ApplicationSeams,
): void {
  app.enableSandbox();

  void app.whenReady().then(() => {
    configureSessionSecurity();
    // The settings folder is the one place the application writes, so every
    // entry gets the same location and no repository under review is touched.
    return startDesktopApplication(createElectronHost(), {
      groupingRulesPath: join(app.getPath("userData"), "grouping-rules.json"),
      ...createSeams(),
    });
  }).catch((error: unknown) => {
    console.error("Prettifer failed to start.", error);
    app.quit();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

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
