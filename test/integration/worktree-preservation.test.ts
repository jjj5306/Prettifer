import { readFile, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { CompositeDiffService } from "../../src/composition/composite-diff-service.js";
import {
  GitCommandRunner,
  NodeProcessExecutor,
  type ProcessExecutor,
  type ProcessRequest,
} from "../../src/git/git-command-runner.js";
import {
  createAuthHistoryFixture,
  type GitFixture,
} from "../support/git-fixture.js";

describe("user worktree preservation", () => {
  let fixture: GitFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("preserves branch, HEAD, index, worktree, and untracked files after success", async () => {
    fixture = await createAuthHistoryFixture();
    await fixture.prepareDirtyWorktree();
    const before = await fixture.snapshotWorktree();

    await new CompositeDiffService().compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.validateLogin],
    });

    await expect(fixture.snapshotWorktree()).resolves.toEqual(before);
  });

  it("preserves the complete worktree state after a selection failure", async () => {
    fixture = await createAuthHistoryFixture();
    await fixture.prepareDirtyWorktree();
    const before = await fixture.snapshotWorktree();

    await expect(
      new CompositeDiffService().compose({
        repositoryPath: fixture.path,
        baseRef: fixture.baseRef,
        headRef: fixture.headRef,
        selectedCommits: [fixture.commits.base],
      }),
    ).rejects.toThrow("outside the current comparison range");

    await expect(fixture.snapshotWorktree()).resolves.toEqual(before);
  });

  it("preserves the complete worktree state after a selected patch cannot be applied", async () => {
    fixture = await createAuthHistoryFixture();
    const loginPath = `${fixture.path}/src/auth/login.ts`;
    const login = await readFile(loginPath, "utf8");
    await writeFile(
      loginPath,
      login.replace("`session:${sessionId}`", "`stored:${sessionId}`"),
      "utf8",
    );
    fixture.git(["add", "src/auth/login.ts"]);
    fixture.git(["commit", "-m", "refactor(auth): mark stored sessions"]);
    await writeFile(
      loginPath,
      (await readFile(loginPath, "utf8")).replace(
        "`stored:${sessionId}`",
        "`encrypted:${sessionId}`",
      ),
      "utf8",
    );
    fixture.git(["add", "src/auth/login.ts"]);
    fixture.git(["commit", "-m", "feat(auth): encrypt stored sessions"]);
    const conflictingCommit = fixture.git(["rev-parse", "HEAD"]).trim();
    await fixture.prepareDirtyWorktree();
    const before = await fixture.snapshotWorktree();

    await expect(
      new CompositeDiffService().compose({
        repositoryPath: fixture.path,
        baseRef: fixture.baseRef,
        headRef: fixture.headRef,
        selectedCommits: [conflictingCommit],
      }),
    ).rejects.toThrow();

    await expect(fixture.snapshotWorktree()).resolves.toEqual(before);
    expect(fixture.git(["worktree", "list", "--porcelain"])).not.toContain(
      "prettifer-composition-",
    );
  });

  it("preserves the complete worktree state when cancellation occurs during apply", async () => {
    fixture = await createAuthHistoryFixture();
    await fixture.prepareDirtyWorktree();
    const before = await fixture.snapshotWorktree();
    const controller = new AbortController();
    const delegate = new NodeProcessExecutor();
    const executor: ProcessExecutor = {
      execute(request: ProcessRequest) {
        if (request.args.includes("cherry-pick")) {
          controller.abort();
        }
        return delegate.execute(request);
      },
    };
    const service = new CompositeDiffService(new GitCommandRunner({ executor }));

    await expect(
      service.compose({
        repositoryPath: fixture.path,
        baseRef: fixture.baseRef,
        headRef: fixture.headRef,
        selectedCommits: [fixture.commits.validateLogin],
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");

    await expect(fixture.snapshotWorktree()).resolves.toEqual(before);
  });
});
