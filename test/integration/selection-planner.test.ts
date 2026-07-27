import { afterEach, describe, expect, it } from "vitest";

import {
  SelectionPlanner,
  type SelectionError,
} from "../../src/composition/selection-planner.js";
import { GitCommandRunner } from "../../src/git/git-command-runner.js";
import {
  createAuthHistoryFixture,
  type GitFixture,
} from "../support/git-fixture.js";

describe("SelectionPlanner", () => {
  let fixture: GitFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("keeps the branch fork point independent from selection changes", async () => {
    fixture = await createAuthHistoryFixture();
    const planner = new SelectionPlanner(new GitCommandRunner());

    const baseBefore = await planner.resolveComparisonBase({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
    });
    await planner.plan({
      repositoryPath: fixture.path,
      baseCommit: baseBefore,
      headRef: fixture.headRef,
      selectedCommits: [fixture.commits.validateLogin],
    });
    const baseAfter = await planner.resolveComparisonBase({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
    });

    expect(baseBefore).toBe(fixture.commits.base);
    expect(baseAfter).toBe(baseBefore);
  });

  it("sorts non-contiguous reverse selections by ancestry", async () => {
    fixture = await createAuthHistoryFixture();
    const planner = new SelectionPlanner(new GitCommandRunner());

    const plan = await planner.plan({
      repositoryPath: fixture.path,
      baseCommit: fixture.commits.base,
      headRef: fixture.headRef,
      selectedCommits: [
        fixture.commits.persistSession,
        fixture.commits.validateLogin,
      ],
    });

    expect(plan.selectedCommits).toEqual([
      fixture.commits.validateLogin,
      fixture.commits.persistSession,
    ]);
  });

  it("identifies a commit outside the comparison range", async () => {
    fixture = await createAuthHistoryFixture();
    const planner = new SelectionPlanner(new GitCommandRunner());

    await expect(
      planner.plan({
        repositoryPath: fixture.path,
        baseCommit: fixture.commits.base,
        headRef: fixture.headRef,
        selectedCommits: [fixture.commits.base],
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SelectionError>>({
        code: "COMMIT_OUTSIDE_COMPARISON",
        commit: fixture.commits.base,
        nextAction: expect.stringContaining("비교 기준이나 선택"),
      }),
    );
  });
});
