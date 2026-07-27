import { describe, expect, it, vi } from "vitest";

import {
  createFolderSelectionBoundary,
  e2eCompositionDelay,
  e2eGitPath,
} from "../../../src/desktop/main/e2e-boundary.js";

describe("Electron E2E boundaries", () => {
  it("returns fixture repositories in order without opening a native dialog", async () => {
    const dialog = { show: vi.fn() };
    const boundary = createFolderSelectionBoundary(dialog, {
      PRETTIFER_E2E: "1",
      PRETTIFER_E2E_REPOSITORIES: JSON.stringify(["C:\\repo-one", "C:\\repo-two"]),
    });

    await expect(boundary.selectFolder()).resolves.toBe("C:\\repo-one");
    await expect(boundary.selectFolder()).resolves.toBe("C:\\repo-two");
    await expect(boundary.selectFolder()).resolves.toBe("C:\\repo-two");
    expect(dialog.show).not.toHaveBeenCalled();
  });

  it("uses the native dialog outside E2E mode and preserves cancellation", async () => {
    const boundary = createFolderSelectionBoundary({
      show: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    }, {});
    await expect(boundary.selectFolder()).resolves.toBeNull();
  });

  it("allows a Git executable override only in E2E mode", () => {
    expect(e2eGitPath({
      PRETTIFER_E2E: "1",
      PRETTIFER_E2E_GIT_PATH: "C:\\missing-git.exe",
    })).toBe("C:\\missing-git.exe");
    expect(e2eGitPath({
      PRETTIFER_E2E_GIT_PATH: "C:\\missing-git.exe",
    })).toBeUndefined();
  });

  it("limits the E2E composition delay and disables it outside E2E mode", async () => {
    const delayed = e2eCompositionDelay({
      PRETTIFER_E2E: "1",
      PRETTIFER_E2E_COMPOSITION_DELAY_MS: "1",
    });
    await expect(delayed()).resolves.toBeUndefined();
    await expect(e2eCompositionDelay({
      PRETTIFER_E2E_COMPOSITION_DELAY_MS: "1000",
    })()).resolves.toBeUndefined();
  });
});
