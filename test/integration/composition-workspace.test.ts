import { access, rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompositionWorkspaceManager,
  removeDirectoryWithRetries,
  type DirectoryRemover,
} from "../../src/composition/composition-workspace.js";
import {
  GitCommandAbortedError,
  GitCommandRunner,
} from "../../src/git/git-command-runner.js";
import {
  createAuthHistoryFixture,
  type GitFixture,
} from "../support/git-fixture.js";

describe("CompositionWorkspaceManager", () => {
  let fixture: GitFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("creates an isolated workspace at the base and removes it after success", async () => {
    fixture = await createAuthHistoryFixture();
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());
    let workspacePath = "";

    const head = await manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      async (workspace) => {
        workspacePath = workspace.path;
        return new GitCommandRunner().run(["rev-parse", "HEAD"], {
          cwd: workspace.path,
        });
      },
    );

    expect(head.stdout.trim()).toBe(fixture.commits.base);
    await expect(access(workspacePath)).rejects.toThrow();
    expect(fixture.git(["worktree", "list", "--porcelain"])).not.toContain(
      workspacePath,
    );
  });

  it("removes workspaces after failures and keeps concurrent requests separate", async () => {
    fixture = await createAuthHistoryFixture();
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());
    const paths: string[] = [];
    let firstPath = "";

    const first = manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      async (workspace) => {
        firstPath = workspace.path;
        paths.push(workspace.path);
        await new Promise((resolve) => setTimeout(resolve, 25));
        return workspace.path;
      },
    );
    const second = manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      (workspace) => {
        paths.push(workspace.path);
        return Promise.reject(new Error("apply failed"));
      },
    );

    await expect(second).rejects.toThrow("apply failed");
    await expect(first).resolves.toBe(firstPath);
    expect(new Set(paths).size).toBe(2);
    for (const path of paths) {
      await expect(access(path)).rejects.toThrow();
    }
  });

  it("removes the workspace when an operation is cancelled", async () => {
    fixture = await createAuthHistoryFixture();
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());
    let workspacePath = "";

    const operation = manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      (workspace) => {
        workspacePath = workspace.path;
        return Promise.reject(new GitCommandAbortedError());
      },
    );

    await expect(operation).rejects.toBeInstanceOf(GitCommandAbortedError);
    await expect(access(workspacePath)).rejects.toThrow();
  });
});

describe("removeDirectoryWithRetries", () => {
  it("retries Windows-style transient file locks and eventually removes the directory", async () => {
    const remove = vi.fn<DirectoryRemover["remove"]>()
      .mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "EPERM" }))
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "EBUSY" }))
      .mockImplementation((path) => rm(path, { force: true, recursive: true }));
    const remover: DirectoryRemover = { remove };

    await expect(
      removeDirectoryWithRetries("C:\\missing-test-directory", {
        attempts: 3,
        delayMilliseconds: 0,
        remover,
      }),
    ).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("reports the remaining path when retries are exhausted", async () => {
    const remover: DirectoryRemover = {
      remove: () =>
        Promise.reject(Object.assign(new Error("locked"), { code: "EPERM" })),
    };

    await expect(
      removeDirectoryWithRetries("C:\\still-locked", {
        attempts: 2,
        delayMilliseconds: 0,
        remover,
      }),
    ).rejects.toMatchObject({
      path: "C:\\still-locked",
      message: expect.stringContaining("정리하지 못했습니다"),
    });
  });
});
