import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompositionWorkspaceManager,
  removeDirectoryWithRetries,
  type DirectoryRemover,
} from "../../src/composition/composition-workspace.js";
import {
  GitCommandAbortedError,
  GitCommandRunner,
  type GitRunOptions,
  type ProcessOutput,
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
      [],
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
      [],
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
      [],
      (workspace) => {
        paths.push(workspace.path);
        return Promise.reject(new Error("apply failed"));
      },
    );

    await expect(second).rejects.toThrow("apply failed");
    const firstResult = await first;
    expect(firstResult).toBe(firstPath);
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
      [],
      (workspace) => {
        workspacePath = workspace.path;
        return Promise.reject(new GitCommandAbortedError());
      },
    );

    await expect(operation).rejects.toBeInstanceOf(GitCommandAbortedError);
    await expect(access(workspacePath)).rejects.toThrow();
  });

  it("materializes only selected paths in the temporary workspace", async () => {
    fixture = await createAuthHistoryFixture();
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());
    const repositoryConfigBefore = fixture.git([
      "config",
      "--local",
      "--list",
    ]);

    await manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      ["src/auth/login.ts"],
      async (workspace) => {
        await expect(access(`${workspace.path}/src/auth/login.ts`)).resolves.toBeUndefined();
        await expect(access(`${workspace.path}/docs/auth.md`)).rejects.toThrow();
        const workspaceGit = new GitCommandRunner();
        await expect(
          workspaceGit.run(["config", "--local", "--get", "core.autocrlf"], {
            cwd: workspace.path,
          }),
        ).resolves.toMatchObject({ stdout: "false\n" });
      },
    );

    expect(fixture.git(["worktree", "list", "--porcelain"])).not.toContain(
      "prettifer-composition-",
    );
    expect(fixture.git(["config", "--local", "--list"])).toBe(
      repositoryConfigBefore,
    );
  });

  it("uses effective worktree-specific content settings", async () => {
    fixture = await createAuthHistoryFixture();
    fixture.git(["config", "extensions.worktreeConfig", "true"]);
    fixture.git(["config", "--worktree", "core.autocrlf", "input"]);
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());

    await manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      ["src/auth/login.ts"],
      async (workspace) => {
        await expect(
          new GitCommandRunner().run(
            ["config", "--includes", "--get", "core.autocrlf"],
            { cwd: workspace.path },
          ),
        ).resolves.toMatchObject({ stdout: "input\n" });
      },
    );
  });

  it("copies repository-specific info attributes before checkout", async () => {
    fixture = await createAuthHistoryFixture();
    const gitDirectory = fixture.git(["rev-parse", "--absolute-git-dir"]).trim();
    const attributesPath = join(gitDirectory, "info", "attributes");
    await writeFile(attributesPath, "src/auth/login.ts binary\n", "utf8");
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());

    await manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      ["src/auth/login.ts"],
      async (workspace) => {
        await expect(
          new GitCommandRunner().run(
            ["check-attr", "binary", "--", "src/auth/login.ts"],
            { cwd: workspace.path },
          ),
        ).resolves.toMatchObject({
          stdout: "src/auth/login.ts: binary: set\n",
        });
      },
    );
  });

  it("uses Git 2.30-compatible commands to locate repository attributes", async () => {
    fixture = await createAuthHistoryFixture();
    const git = new RecordingGitRunner();
    const manager = new CompositionWorkspaceManager(git);

    await manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      ["src/auth/login.ts"],
      () => Promise.resolve(),
    );

    expect(git.commands.flat()).not.toContain("--path-format=absolute");
  });

  it("keeps a relative attributes file anchored to the source repository", async () => {
    fixture = await createAuthHistoryFixture();
    const attributesFile = join(fixture.path, "prettifer-attributes");
    await writeFile(attributesFile, "src/auth/login.ts binary\n", "utf8");
    fixture.git([
      "config",
      "--local",
      "core.attributesFile",
      "prettifer-attributes",
    ]);
    expect(fixture.git([
      "check-attr",
      "binary",
      "--",
      "src/auth/login.ts",
    ])).toBe("src/auth/login.ts: binary: set\n");
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());

    await manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      ["src/auth/login.ts"],
      async (workspace) => {
        await expect(
          new GitCommandRunner().run(
            ["check-attr", "binary", "--", "src/auth/login.ts"],
            { cwd: workspace.path },
          ),
        ).resolves.toMatchObject({
          stdout: "src/auth/login.ts: binary: set\n",
        });
      },
    );

    expect(fixture.git([
      "config",
      "--local",
      "--get",
      "core.attributesFile",
    ])).toBe("prettifer-attributes\n");
  });

  it("uses a full checkout for a repository-specific external driver", async () => {
    fixture = await createAuthHistoryFixture();
    fixture.git([
      "config",
      "--local",
      "merge.prettifer.driver",
      "prettifer-merge-driver %O %A %B",
    ]);
    fixture.git([
      "config",
      "--local",
      "core.hooksPath",
      "C:/prettifer-source-hooks-must-not-run",
    ]);
    const repositoryConfigBefore = fixture.git(["config", "--local", "--list"]);
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());

    await manager.withWorkspace(
      fixture.path,
      fixture.commits.base,
      ["src/auth/login.ts"],
      async (workspace) => {
        await expect(access(`${workspace.path}/docs/auth.md`)).resolves.toBeUndefined();
        const workspaceGit = new GitCommandRunner();
        await expect(
          workspaceGit.run(
            ["config", "--includes", "--get", "merge.prettifer.driver"],
            { cwd: workspace.path },
          ),
        ).resolves.toMatchObject({
          stdout: "prettifer-merge-driver %O %A %B\n",
        });
        const hooksPath = await workspaceGit.run(
          ["config", "--local", "--get", "core.hooksPath"],
          { cwd: workspace.path },
        );
        expect(hooksPath.stdout).toContain("disabled-hooks");
        expect(hooksPath.stdout).not.toContain("source-hooks-must-not-run");
      },
    );

    expect(fixture.git(["config", "--local", "--list"])).toBe(
      repositoryConfigBefore,
    );
  });

  it("does not remove an unrelated worktree registration", async () => {
    fixture = await createAuthHistoryFixture();
    const manager = new CompositionWorkspaceManager(new GitCommandRunner());
    const unrelatedRoot = await mkdtemp(join(tmpdir(), "prettifer-unrelated-worktree-"));
    const unrelatedPath = join(unrelatedRoot, "offline");
    const normalizedUnrelatedPath = unrelatedPath.replaceAll("\\", "/");

    fixture.git(["worktree", "add", "--detach", unrelatedPath, fixture.commits.base]);
    await rm(unrelatedPath, { force: true, recursive: true });

    try {
      expect(fixture.git(["worktree", "list", "--porcelain"])).toContain(
        normalizedUnrelatedPath,
      );

      await manager.withWorkspace(
        fixture.path,
        fixture.commits.base,
        [],
        () => Promise.resolve("complete"),
      );

      expect(fixture.git(["worktree", "list", "--porcelain"])).toContain(
        normalizedUnrelatedPath,
      );
    } finally {
      fixture.git(["worktree", "prune", "--expire", "now"]);
      await rm(unrelatedRoot, { force: true, recursive: true });
    }
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
      message: expect.stringContaining("could not be removed"),
    });
  });
});

class RecordingGitRunner extends GitCommandRunner {
  readonly commands: string[][] = [];

  override run(
    gitArguments: readonly string[],
    options: GitRunOptions,
  ): Promise<ProcessOutput> {
    this.commands.push([...gitArguments]);
    return super.run(gitArguments, options);
  }
}
