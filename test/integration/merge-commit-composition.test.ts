import { afterEach, describe, expect, it } from "vitest";

import { CompositeDiffService } from "../../src/composition/composite-diff-service.js";
import { SelectionError } from "../../src/composition/selection-planner.js";
import { GitCommandRunner } from "../../src/git/git-command-runner.js";
import {
  createMergeFixture,
  type MergeFixture,
} from "../support/merge-fixture.js";

describe("CompositeDiffService with merge commits", () => {
  let fixture: MergeFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  function paths(files: readonly { readonly path: string }[]): string[] {
    return files.map((file) => file.path).sort();
  }

  it("applies only the changes between the chosen mainline parent and the merge", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const firstParent = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.merge],
      mainlineParents: { [fixture.commits.merge]: 1 },
    });

    // Parent 1 is the working branch, so the merge brings in the side branch.
    expect(paths(firstParent.files)).toEqual(["side-one.txt"]);
    expect(firstParent.mainlineParents).toEqual({ [fixture.commits.merge]: 1 });
  });

  it("applies the other side of the merge when the second parent is chosen", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const secondParent = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.merge],
      mainlineParents: { [fixture.commits.merge]: 2 },
    });

    // Parent 2 is the side branch, so the merge brings in the working branch change.
    expect(paths(secondParent.files)).toEqual(["mainline.txt"]);
    expect(secondParent.mainlineParents).toEqual({ [fixture.commits.merge]: 2 });
  });

  it("combines a merge commit with a regular commit in ancestry order", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.followUp, fixture.commits.merge],
      mainlineParents: { [fixture.commits.merge]: 1 },
    });

    expect(result.selectedCommits).toEqual([
      fixture.commits.merge,
      fixture.commits.followUp,
    ]);
    expect(paths(result.files)).toEqual(["follow-up.txt", "side-one.txt"]);
  });

  it("reports a merge commit selected without a mainline parent", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const composition = service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.merge],
    });

    await expect(composition).rejects.toBeInstanceOf(SelectionError);
    await expect(composition).rejects.toMatchObject({
      code: "MAINLINE_PARENT_REQUIRED",
      commit: fixture.commits.merge,
    });
  });

  it("reports a mainline parent outside the parent range", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const composition = service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.octopus],
      mainlineParents: { [fixture.commits.octopus]: 4 },
    });

    await expect(composition).rejects.toMatchObject({
      code: "MAINLINE_PARENT_OUT_OF_RANGE",
      commit: fixture.commits.octopus,
    });
  });

  it("accepts a three-parent merge with a parent inside the range", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.octopus],
      mainlineParents: { [fixture.commits.octopus]: 1 },
    });

    expect(paths(result.files)).toEqual(["side-three.txt", "side-two.txt"]);
  });

  it("ignores a mainline parent given for a single-parent commit", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.mainline],
      mainlineParents: { [fixture.commits.mainline]: 1 },
    });

    expect(paths(result.files)).toEqual(["mainline.txt"]);
    expect(result.mainlineParents).toEqual({});
  });

  it("ignores mainline parents for commits that are not selected", async () => {
    fixture = await createMergeFixture();
    const service = new CompositeDiffService(new GitCommandRunner());

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.mainline],
      mainlineParents: { [fixture.commits.merge]: 2 },
    });

    expect(paths(result.files)).toEqual(["mainline.txt"]);
    expect(result.mainlineParents).toEqual({});
  });
});
