import { writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  CompositeDiffService,
  type CompositeFileChange,
} from "../../src/composition/composite-diff-service.js";
import {
  GitCommandError,
  GitCommandRunner,
  type GitRunOptions,
  type ProcessOutput,
} from "../../src/git/git-command-runner.js";
import {
  createAuthHistoryFixture,
  type GitFixture,
} from "../support/git-fixture.js";

describe("CompositeDiffService", () => {
  let fixture: GitFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("composes only selected non-contiguous commits", async () => {
    fixture = await createAuthHistoryFixture();
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [
        fixture.commits.persistSession,
        fixture.commits.validateLogin,
      ],
    });

    expect(result.baseCommit).toBe(fixture.commits.base);
    expect(result.selectedCommits).toEqual([
      fixture.commits.validateLogin,
      fixture.commits.persistSession,
    ]);
    expect(result.files.map(({ path }) => path)).toEqual([
      "src/auth/login.ts",
      "src/auth/session.ts",
    ]);
    expect(result.unifiedDiff).toContain("validateLoginRequest");
    expect(result.unifiedDiff).toContain("persistSession");
    expect(result.unifiedDiff).not.toContain("normalizeUsername");
    expect(result.unifiedDiff).not.toContain("Sessions are stored");
  });

  it("returns one final file state for multiple selected changes to the same file", async () => {
    fixture = await createAuthHistoryFixture();
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [
        fixture.commits.validateLogin,
        fixture.commits.persistSession,
      ],
    });
    const loginFiles = result.files.filter(
      ({ path }) => path === "src/auth/login.ts",
    );

    expect(loginFiles).toHaveLength(1);
    expect(loginFiles[0]?.beforeContent).not.toContain("validateLoginRequest");
    expect(loginFiles[0]?.afterContent).toContain("validateLoginRequest");
    expect(loginFiles[0]?.afterContent).toContain("persistSession");
    expect(result.unifiedDiff.match(/diff --git a\/src\/auth\/login\.ts/g)).toHaveLength(1);
  });

  it("reports final added, modified, and deleted text files", async () => {
    fixture = await createAuthHistoryFixture();
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.fileLifecycle],
    });
    const byPath = new Map<string, CompositeFileChange>(
      result.files.map((file) => [file.path, file]),
    );

    expect(byPath.get("src/auth/audit.ts")).toMatchObject({
      status: "added",
      beforeContent: null,
      afterContent: expect.stringContaining("auditLogin"),
    });
    expect(byPath.get("src/config.ts")).toMatchObject({
      status: "modified",
      beforeContent: expect.stringContaining("false"),
      afterContent: expect.stringContaining("true"),
    });
    expect(byPath.get("src/obsolete.ts")).toMatchObject({
      status: "deleted",
      beforeContent: expect.stringContaining("obsolete"),
      afterContent: null,
    });
  });

  it("returns identical ordered content and diff for identical inputs", async () => {
    fixture = await createAuthHistoryFixture();
    const service = new CompositeDiffService();
    const request = {
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [
        fixture.commits.validateLogin,
        fixture.commits.persistSession,
      ],
    } as const;

    const first = await service.compose(request);
    const second = await service.compose(request);

    expect(second).toEqual(first);
  });

  it("limits concurrent Git processes while collecting paths and file contents", async () => {
    fixture = await createAuthHistoryFixture();
    const git = new ConcurrencyTrackingRunner();
    const service = new CompositeDiffService(git);

    await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [
        fixture.commits.validateLogin,
        fixture.commits.extractHelpers,
        fixture.commits.persistSession,
        fixture.commits.authDocs,
        fixture.commits.fileLifecycle,
      ],
    });

    expect(git.maximumChangedPathRequests).toBe(4);
    expect(git.maximumContentReadRequests).toBe(4);
  });

  it("identifies a commit that depends on an unselected file-creating commit", async () => {
    fixture = await createAuthHistoryFixture();
    const dependentPath = `${fixture.path}/src/dependent.ts`;
    await writeFile(dependentPath, "export const value = 1;\n", "utf8");
    fixture.git(["add", "src/dependent.ts"]);
    fixture.git(["commit", "-m", "feat: add dependent file"]);
    const prerequisite = fixture.git(["rev-parse", "HEAD"]).trim();
    await writeFile(dependentPath, "export const value = 2;\n", "utf8");
    fixture.git(["add", "src/dependent.ts"]);
    fixture.git(["commit", "-m", "fix: update dependent file"]);
    const dependent = fixture.git(["rev-parse", "HEAD"]).trim();
    const service = new CompositeDiffService();

    await expect(service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [dependent],
    })).rejects.toMatchObject({
      code: "COMMIT_APPLY_CONFLICT",
      commit: dependent,
    });

    await expect(
      new CompositeDiffService(new Exit128ConflictRunner()).compose({
        repositoryPath: fixture.path,
        baseRef: fixture.baseRef,
        headRef: fixture.headRef,
        selectedCommits: [dependent],
      }),
    ).rejects.toMatchObject({
      name: "GitCommandError",
      exitCode: 128,
    });

    await expect(service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [prerequisite, dependent],
    })).resolves.toMatchObject({
      selectedCommits: [prerequisite, dependent],
      files: [
        expect.objectContaining({
          path: "src/dependent.ts",
          afterContent: "export const value = 2;\n",
        }),
      ],
    });
  });

  it("preserves a non-conflict Git failure for the caller to diagnose", async () => {
    fixture = await createAuthHistoryFixture();
    const service = new CompositeDiffService(
      new NonConflictCherryPickFailureRunner(),
    );

    await expect(service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.validateLogin],
    })).rejects.toMatchObject({
      name: "GitCommandError",
      stderr: "fatal: could not lock index",
    });
  });

  it("marks binary files without decoding their contents", async () => {
    fixture = await createAuthHistoryFixture();
    const binaryPath = `${fixture.path}/src/sample.bin`;
    await writeFile(binaryPath, Uint8Array.from([0, 1, 2, 3, 255]));
    fixture.git(["add", "src/sample.bin"]);
    fixture.git(["commit", "-m", "test: add binary fixture"]);
    const binaryCommit = fixture.git(["rev-parse", "HEAD"]).trim();

    const result = await new CompositeDiffService().compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [binaryCommit],
    });

    expect(result.files).toContainEqual({
      path: "src/sample.bin",
      status: "added",
      binary: true,
      beforeContent: null,
      afterContent: null,
    });
  });
});

class NonConflictCherryPickFailureRunner extends GitCommandRunner {
  override run(
    gitArguments: readonly string[],
    options: GitRunOptions,
  ): Promise<ProcessOutput> {
    if (gitArguments[0] === "cherry-pick") {
      return Promise.reject(
        new GitCommandError(
          gitArguments,
          128,
          "",
          "fatal: could not lock index",
        ),
      );
    }
    return super.run(gitArguments, options);
  }
}

class Exit128ConflictRunner extends GitCommandRunner {
  override async run(
    gitArguments: readonly string[],
    options: GitRunOptions,
  ): Promise<ProcessOutput> {
    try {
      return await super.run(gitArguments, options);
    } catch (error) {
      if (
        gitArguments[0] !== "cherry-pick" ||
        !(error instanceof GitCommandError) ||
        error.exitCode !== 1
      ) {
        throw error;
      }
      throw new GitCommandError(
        gitArguments,
        128,
        error.stdout,
        error.stderr,
        { cause: error },
      );
    }
  }
}

class ConcurrencyTrackingRunner extends GitCommandRunner {
  private activeChangedPathRequests = 0;
  private activeContentReadRequests = 0;
  maximumChangedPathRequests = 0;
  maximumContentReadRequests = 0;

  override async run(
    gitArguments: readonly string[],
    options: GitRunOptions,
  ): Promise<ProcessOutput> {
    if (gitArguments[0] === "diff-tree") {
      this.activeChangedPathRequests += 1;
      this.maximumChangedPathRequests = Math.max(
        this.maximumChangedPathRequests,
        this.activeChangedPathRequests,
      );
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return await super.run(gitArguments, options);
      } finally {
        this.activeChangedPathRequests -= 1;
      }
    }
    if (gitArguments[0] === "show") {
      this.activeContentReadRequests += 1;
      this.maximumContentReadRequests = Math.max(
        this.maximumContentReadRequests,
        this.activeContentReadRequests,
      );
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return await super.run(gitArguments, options);
      } finally {
        this.activeContentReadRequests -= 1;
      }
    }
    return super.run(gitArguments, options);
  }
}
