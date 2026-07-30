import { createFolderDialog, runElectronApplication } from "./electron-host.js";

/**
 * Production entry point. It supplies only the real folder dialog: the shipped
 * bundle has no test seams and reads no test environment variables. The
 * end-to-end entry lives in `index.e2e.ts` and is removed when packaging.
 */
runElectronApplication(() => {
  const folders = createFolderDialog();
  return {
    async selectFolder(): Promise<string | null> {
      const result = await folders.show();
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
  };
});
