import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  RepositoryHistoryError,
  RepositoryHistoryService,
  type RepositoryRange,
} from "../../src/history/repository-history-service.js";
import {
  GitCommandRunner,
  NodeProcessExecutor,
  type ProcessExecutor,
} from "../../src/git/git-command-runner.js";
import { createHistoryFixture, type HistoryFixture } from "../support/history-fixture.js";

describe("RepositoryHistoryService", () => {
  let fixture: HistoryFixture;
  let mutableFixture: HistoryFixture | undefined;
  let temporaryPath: string | undefined;

  beforeAll(async () => {
    fixture = await createHistoryFixture();
  });

  afterEach(async () => {
    if (temporaryPath !== undefined) {
      await rm(temporaryPath, { force: true, recursive: true });
      temporaryPath = undefined;
    }
  });

  afterAll(async () => {
    await fixture.dispose();
    await mutableFixture?.dispose();
  });

  it("identifies a repository, current branch, and sorted local branches", async () => {
    const service = new RepositoryHistoryService();

    const repository = await service.getRepository(fixture.path);

    expect(repository.rootPath).toBe(resolve(fixture.path));
    expect(repository.currentBranch).toBe(fixture.headRef);
    expect(repository.branches.map((branch) => branch.name)).toEqual([
      "feature/desktop-history",
      "feature/history-side",
      "main",
    ]);
    expect(repository.branches.find((branch) => branch.isCurrent)?.name).toBe(fixture.headRef);
  });

  it("explains how to recover when the selected folder is not a Git repository", async () => {
    temporaryPath = await mkdtemp(join(tmpdir(), "prettifer-not-repository-"));
    const service = new RepositoryHistoryService();

    await expect(service.getRepository(temporaryPath)).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryHistoryError>>({
        code: "INVALID_REPOSITORY",
        subject: resolve(temporaryPath),
        nextAction: "Choose another Git repository folder.",
      }),
    );
  });

  it("explains how to configure Git when the executable cannot run", async () => {
    const executor: ProcessExecutor = {
      execute: () => Promise.reject(new Error("spawn git ENOENT")),
    };
    const service = new RepositoryHistoryService(new GitCommandRunner({ executor }));

    await expect(service.getRepository(process.cwd())).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryHistoryError>>({
        code: "GIT_UNAVAILABLE",
        nextAction: "Install Git or check its executable path, then try again.",
      }),
    );
  });

  it("resolves local branch commits and their common ancestor", async () => {
    const service = new RepositoryHistoryService();

    const range = await service.createRange({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
    });

    expect(range).toMatchObject({
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      baseCommit: fixture.baseCommit,
      headCommit: fixture.initialHeadCommit,
    });
    expect(range.revision).toContain(fixture.initialHeadCommit);
  });

  it("rejects a branch that is not in the repository", async () => {
    const service = new RepositoryHistoryService();

    await expect(
      service.createRange({
        repositoryPath: fixture.path,
        baseRef: fixture.baseRef,
        headRef: "feature/missing",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryHistoryError>>({
        code: "BRANCH_NOT_FOUND",
        subject: "feature/missing",
      }),
    );
  });

  it("returns first-parent commits newest-first in stable pages and marks merges", async () => {
    const service = new RepositoryHistoryService();
    const range = await createRange(service, fixture);

    const firstPage = await service.listCommits({
      repositoryPath: fixture.path,
      range,
    });
    const secondPage = await service.listCommits({
      repositoryPath: fixture.path,
      range,
      offset: firstPage.nextOffset ?? 0,
    });

    expect(firstPage.commits).toHaveLength(100);
    expect(firstPage.nextOffset).toBe(100);
    expect(firstPage.commits[0]).toMatchObject({
      id: fixture.mergeCommit,
      isMerge: true,
      selectable: true,
      title: "merge: include history side branch",
    });
    expect(secondPage.commits).toHaveLength(5);
    expect(secondPage.nextOffset).toBeNull();
    expect(secondPage.commits.at(-1)?.id).toBe(fixture.firstFeatureCommit);
  });

  it("rejects pages and composition inputs after the head branch moves", async () => {
    /*
     * Its own repository, because advancing HEAD would spoil the shared one. It
     * never pages, so it skips the filler commits the shared fixture needs; the
     * fixture used to cost more than a third of the per-test timeout on its own.
     */
    mutableFixture = await createHistoryFixture({ fillerCommits: 1 });
    const service = new RepositoryHistoryService();
    const range = await createRange(service, mutableFixture);
    await mutableFixture.advanceHead();

    await expect(
      service.listCommits({ repositoryPath: mutableFixture.path, range }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RepositoryHistoryError>>({
        code: "RANGE_STALE",
        subject: mutableFixture.headRef,
        nextAction: "Reload the branch history, then select the commits again.",
      }),
    );
    await expect(
      service.assertRangeCurrent({ repositoryPath: mutableFixture.path, range }),
    ).rejects.toBeInstanceOf(RepositoryHistoryError);
  });

  it("rejects a range whose common ancestor was replaced by renderer input", async () => {
    const service = new RepositoryHistoryService();
    const range = await createRange(service, fixture);
    const tampered = {
      ...range,
      baseCommit: fixture.firstFeatureCommit,
      revision: `${range.baseRefCommit}:${range.headCommit}:${fixture.firstFeatureCommit}`,
    };

    await expect(service.assertRangeCurrent({
      repositoryPath: fixture.path,
      range: tampered,
    })).rejects.toMatchObject({ code: "RANGE_STALE" });
  });

  it("accepts every commit on the displayed first-parent history, merges included", async () => {
    const service = new RepositoryHistoryService();
    const range = await createRange(service, fixture);
    const sideCommit = fixture.git(["rev-parse", "feature/history-side"]).trim();

    await expect(service.assertCompositionInput({
      repositoryPath: fixture.path,
      range,
      selectedCommits: [fixture.firstFeatureCommit],
    })).resolves.toBeUndefined();
    // A merge is on the first-parent history, so selecting it is allowed. The
    // mainline parent it needs is validated when the result is composed.
    await expect(service.assertCompositionInput({
      repositoryPath: fixture.path,
      range,
      selectedCommits: [fixture.mergeCommit],
    })).resolves.toBeUndefined();
    // A commit reachable only from a side branch is still outside the range.
    await expect(service.assertCompositionInput({
      repositoryPath: fixture.path,
      range,
      selectedCommits: [sideCommit],
    })).rejects.toMatchObject({ code: "COMMIT_NOT_SELECTABLE", subject: sideCommit });
  });

  it("carries the subject of every parent a merge offers as a choice", async () => {
    const service = new RepositoryHistoryService();
    const range = await createRange(service, fixture);

    const page = await service.listCommits({ repositoryPath: fixture.path, range });
    const merge = page.commits.find((commit) => commit.id === fixture.mergeCommit);
    const plain = page.commits.find((commit) => !commit.isMerge);

    expect(merge?.parents).toHaveLength(2);
    // Its first parent is the head branch before the merge, its second the side
    // branch that came in.
    expect(merge?.parents.map((parent) => parent.title)).toEqual([
      "feat(history): commit 103",
      "feat(history): add side branch",
    ]);
    for (const parent of merge?.parents ?? []) {
      expect(parent.shortId).toBe(parent.id.slice(0, 7));
    }
    // A parent that is never offered as a choice is never read.
    expect(plain?.parents.map((parent) => parent.title)).toEqual([null]);
  });

  it("reads parent subjects once per page, and not at all without a merge", async () => {
    const range = await new RepositoryHistoryService().createRange({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
    });
    const runs: string[][] = [];
    const realGit = new NodeProcessExecutor();
    const recorder: ProcessExecutor = {
      execute: async (request) => {
        runs.push([...request.args]);
        return await realGit.execute(request);
      },
    };
    const service = new RepositoryHistoryService(
      new GitCommandRunner({ executor: recorder }),
    );

    // The merge sits on the newest page; the oldest page holds none.
    await service.listCommits({ repositoryPath: fixture.path, range });
    const withMerge = subjectReads(runs);
    runs.length = 0;
    await service.listCommits({ repositoryPath: fixture.path, range, offset: 100 });

    expect(withMerge).toHaveLength(1);
    expect(subjectReads(runs)).toEqual([]);
    // Every id asked for is distinct: a commit parenting two merges is read once.
    const asked = withMerge[0]?.filter((argument) => /^[0-9a-f]{40}$/u.test(argument)) ?? [];
    expect(new Set(asked).size).toBe(asked.length);
  });
});

/** The reads that fetch parent subjects, told apart by their walk-free form. */
function subjectReads(runs: readonly string[][]): string[][] {
  return runs.filter((args) => args.includes("--no-walk"));
}

async function createRange(
  service: RepositoryHistoryService,
  fixture: HistoryFixture,
): Promise<RepositoryRange> {
  return service.createRange({
    repositoryPath: fixture.path,
    baseRef: fixture.baseRef,
    headRef: fixture.headRef,
  });
}
