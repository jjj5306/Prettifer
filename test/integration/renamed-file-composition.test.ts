import { afterEach, describe, expect, it } from "vitest";

import { CompositeDiffService } from "../../src/composition/composite-diff-service.js";
import {
  createRenameFixture,
  type RenameFixture,
} from "../support/rename-fixture.js";

describe("composing a selection that moved files", () => {
  let fixture: RenameFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("reports a file moved without edits as one rename", async () => {
    fixture = await createRenameFixture();
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.pureMove],
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({
      path: fixture.paths.pureTo,
      status: "renamed",
      previousPath: fixture.paths.pureFrom,
      similarity: 100,
    });
    // The move is one change in the diff, not a delete beside an add.
    expect(result.unifiedDiff).toContain(`rename from ${fixture.paths.pureFrom}`);
    expect(result.unifiedDiff).toContain(`rename to ${fixture.paths.pureTo}`);
  });

  it("carries both contents for a file that moved and changed", async () => {
    fixture = await createRenameFixture();
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.moveWithEdit],
    });

    const [moved] = result.files;
    expect(moved).toMatchObject({
      path: fixture.paths.editedTo,
      status: "renamed",
      previousPath: fixture.paths.editedFrom,
    });
    if (moved?.status !== "renamed" || moved.binary === true) {
      throw new Error("The moved file was not composed as a text rename.");
    }
    // Edited as well as moved, so Git matched less than the whole file.
    expect(moved.similarity).toBeGreaterThan(50);
    expect(moved.similarity).toBeLessThan(100);
    // The left side comes from the path the file had at the base.
    expect(moved.beforeContent).toContain("edited line 0");
    expect(moved.afterContent).toContain("edited line zero, reworked");
  });

  it("leaves a rewritten file as a delete and an add", async () => {
    fixture = await createRenameFixture();
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.rewrite],
    });

    // Too little of the content survived to call the two paths one file, so both
    // paths stay in the result rather than one of them going missing.
    expect(result.files.map((file) => [file.path, file.status])).toEqual([
      [fixture.paths.rewrittenTo, "added"],
      [fixture.paths.rewrittenFrom, "deleted"],
    ]);
  });

  it("detects the same renames whatever the user configured", async () => {
    fixture = await createRenameFixture();
    // Both settings would change the answer if the calculation read them: one
    // turns detection off, the other refuses to search past a single candidate.
    fixture.git(["config", "diff.renames", "false"]);
    fixture.git(["config", "diff.renameLimit", "1"]);
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.pureMove, fixture.commits.moveWithEdit],
    });

    expect(result.files.map((file) => [file.path, file.status])).toEqual([
      [fixture.paths.pureTo, "renamed"],
      [fixture.paths.editedTo, "renamed"],
    ]);
  });

  it("keeps a file the selection never touched out of the result", async () => {
    fixture = await createRenameFixture();
    const service = new CompositeDiffService();

    const result = await service.compose({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.pureMove],
    });

    expect(result.files.map((file) => file.path))
      .not.toContain(fixture.paths.untouched);
  });
});
