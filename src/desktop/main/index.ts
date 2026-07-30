import { app } from "electron";

import { repositoryPathFromArgv } from "./command-line.js";
import { createFolderDialog, runElectronApplication } from "./electron-host.js";

/**
 * Production entry point. It supplies the real folder dialog and the repository
 * path the user passed on the command line: the shipped bundle has no test seams
 * and reads no test environment variables. The end-to-end entry lives in
 * `index.e2e.ts` and is removed when packaging.
 */
runElectronApplication(() => {
  const folders = createFolderDialog();
  return {
    async selectFolder(): Promise<string | null> {
      const result = await folders.show();
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    initialRepositoryPath: () =>
      repositoryPathFromArgv(process.argv, app.isPackaged),
  };
});
