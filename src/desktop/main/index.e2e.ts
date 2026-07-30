/**
 * End-to-end entry point. It reads the `PRETTIFER_E2E_*` variables that make an
 * Electron run deterministic and passes them as seams to the same assembly the
 * production entry uses. This bundle is never shipped: `forge.config.cjs`
 * removes it from the packaged application.
 */
import { createFolderDialog, runElectronApplication } from "./electron-host.js";
import {
  createFolderSelectionBoundary,
  e2eCompositionDelay,
  e2eGitPath,
} from "./e2e-boundary.js";

runElectronApplication(() => {
  const folders = createFolderSelectionBoundary(createFolderDialog(), process.env);
  const delay = e2eCompositionDelay(process.env);
  const gitPath = e2eGitPath(process.env);
  return {
    selectFolder: () => folders.selectFolder(),
    beforeComposition: () => delay(),
    ...(gitPath === undefined ? {} : { gitPath }),
  };
});
