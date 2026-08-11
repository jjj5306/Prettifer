import { afterEach, describe, expect, it } from "vitest";

import { CompositeDiffService } from "../../src/composition/composite-diff-service.js";
import { SelectionError } from "../../src/composition/selection-planner.js";
import { GitCommandRunner } from "../../src/git/git-command-runner.js";
import {
  createConflictFixture,
  type ConflictFixture,
} from "../support/conflict-fixture.js";

describe("CompositeDiffService partial results", () => {
  let fixture: ConflictFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  function paths(entries: readonly { readonly path: string }[]): string[] {
    return entries.map((entry) => entry.path).sort();
  }

  it("keeps the clean changes of a commit whose other file conflicts", async () => {
    fixture = await createConflictFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.conflicting, fixture.commits.independent],
    });

    expect(paths(result.files)).toEqual(["clean.txt", "later.txt"]);
    expect(paths(result.problemFiles)).toEqual(["shared.txt"]);
    expect(result.problemFiles[0]).toMatchObject({
      path: "shared.txt",
      code: "CONTENT_CHOICE_REQUIRED",
      commit: fixture.commits.conflicting,
    });
    expect(result.problemFiles[0]?.nextAction).toContain("prerequisite");
    expect(result.fileContributions).toEqual([
      { path: "clean.txt", commits: [fixture.commits.conflicting] },
      { path: "later.txt", commits: [fixture.commits.independent] },
      { path: "shared.txt", commits: [] },
    ]);
  });

  it("leaves the problem file out of the unified diff", async () => {
    fixture = await createConflictFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.conflicting],
    });

    expect(result.unifiedDiff).toContain("clean.txt");
    expect(result.unifiedDiff).not.toContain("shared.txt");
    expect(result.unifiedDiff).not.toContain("<<<<<<<");
  });

  it("reports no problems for a selection that applies cleanly", async () => {
    fixture = await createConflictFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.independent],
    });

    expect(result.problemFiles).toEqual([]);
    expect(paths(result.files)).toEqual(["later.txt"]);
  });

  it("keeps a problem file out of the result when a later commit changes it again", async () => {
    fixture = await createConflictFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      // farEdit touches a different region of shared.txt and would apply cleanly.
      selectedCommits: [fixture.commits.conflicting, fixture.commits.farEdit],
    });

    expect(paths(result.problemFiles)).toEqual(["shared.txt"]);
    expect(paths(result.files)).not.toContain("shared.txt");
  });

  it("names the earliest conflicting commit when one file conflicts twice", async () => {
    fixture = await createConflictFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      // Both commits rewrite the same first line of shared.txt.
      selectedCommits: [fixture.commits.conflicting, fixture.commits.conflictingOnly],
    });

    expect(paths(result.problemFiles)).toEqual(["shared.txt"]);
    // The earliest conflict points at the earliest missing prerequisite.
    expect(result.problemFiles[0]?.commit).toBe(fixture.commits.conflicting);
  });

  it("reports a failure when every changed file is a problem", async () => {
    fixture = await createConflictFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const composition = service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.conflictingOnly],
    });

    await expect(composition).rejects.toBeInstanceOf(SelectionError);
    await expect(composition).rejects.toMatchObject({
      code: "COMMIT_APPLY_CONFLICT",
      commit: fixture.commits.conflictingOnly,
    });
  });

  it("leaves no unmerged entries in the temporary workspace", async () => {
    fixture = await createConflictFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.conflicting],
    });

    expect(fixture.git(["ls-files", "--unmerged"])).toBe("");
    expect(fixture.git(["status", "--porcelain"])).toBe("");
  });
});
