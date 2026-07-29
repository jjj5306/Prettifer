import { describe, expect, it } from "vitest";

import {
  CompositeDiffCoordinator,
  type CompositeDiffCalculator,
  type CompositeDiffResult,
} from "../../src/composition/composite-diff-coordinator.js";
import { SelectionError } from "../../src/composition/selection-planner.js";
import { GitCommandError } from "../../src/git/git-command-runner.js";

const result = (commit: string): CompositeDiffResult => ({
  baseCommit: "base",
  selectedCommits: [commit],
  mainlineParents: {},
  problemFiles: [],
  files: [],
  unifiedDiff: commit,
});

describe("CompositeDiffCoordinator", () => {
  it("publishes only the latest selection when an older calculation finishes late", async () => {
    const pending = new Map<
      string,
      (value: CompositeDiffResult) => void
    >();
    const calculator: CompositeDiffCalculator = {
      compose(request) {
        return new Promise((resolve) => {
          pending.set(request.selectedCommits[0] ?? "", resolve);
        });
      },
    };
    const coordinator = new CompositeDiffCoordinator(calculator);

    const first = coordinator.update(requestFor("first"));
    const second = coordinator.update(requestFor("second"));
    pending.get("first")?.(result("first"));
    await first;

    expect(coordinator.current).toMatchObject({
      status: "calculating",
      selectedCommits: ["second"],
    });

    pending.get("second")?.(result("second"));
    await second;
    expect(coordinator.current).toMatchObject({
      status: "ready",
      result: { unifiedDiff: "second" },
    });
  });

  it("clears the previous result when every commit is deselected", async () => {
    const calculator: CompositeDiffCalculator = {
      compose: (request) => Promise.resolve(result(request.selectedCommits[0] ?? "")),
    };
    const coordinator = new CompositeDiffCoordinator(calculator);

    await coordinator.update(requestFor("selected"));
    await coordinator.update({ ...requestFor("selected"), selectedCommits: [] });

    expect(coordinator.current).toEqual({
      status: "idle",
      message: "Select at least one commit to build a result.",
    });
  });

  it("publishes an actionable diagnostic without a completed result", async () => {
    const calculator: CompositeDiffCalculator = {
      compose: () =>
        Promise.reject(
          new SelectionError(
            "COMMIT_OUTSIDE_COMPARISON",
            "outside",
            "Change the comparison range or selection, then try again.",
          ),
        ),
    };
    const coordinator = new CompositeDiffCoordinator(calculator);

    await coordinator.update(requestFor("outside"));

    expect(coordinator.current).toEqual({
      status: "error",
      selectedCommits: ["outside"],
      diagnostic: {
        code: "COMMIT_OUTSIDE_COMPARISON",
        message: expect.stringContaining("outside"),
        commit: "outside",
        nextAction: "Change the comparison range or selection, then try again.",
      },
    });
  });

  it.each([
    {
      name: "repository lock",
      stderr:
        "fatal: Unable to create 'C:\\Users\\secret\\repo\\.git\\index.lock': File exists.",
      diagnostic: {
        code: "REPOSITORY_LOCKED",
        message: "The repository is busy with another Git operation.",
        nextAction: "Wait for other Git operations to finish, then try again.",
      },
    },
    {
      name: "repository permission",
      stderr:
        "fatal: could not open 'C:\\Users\\secret\\repo\\.git\\index': Permission denied",
      diagnostic: {
        code: "REPOSITORY_PERMISSION_DENIED",
        message: "The selected result could not access the repository workspace.",
        nextAction: "Check repository and temporary-folder permissions, then try again.",
      },
    },
    {
      name: "insufficient storage",
      stderr:
        "fatal: cannot write 'C:\\Users\\secret\\AppData\\Local\\Temp\\index': No space left on device",
      diagnostic: {
        code: "INSUFFICIENT_STORAGE",
        message: "The selected result could not be built because available storage is insufficient.",
        nextAction: "Free storage space on the repository or system drive, then try again.",
      },
    },
  ])("classifies a $name failure without exposing Git details", async ({
    stderr,
    diagnostic,
  }) => {
    const coordinator = new CompositeDiffCoordinator(rejectingCalculator(
      new GitCommandError(["cherry-pick"], 128, "", stderr),
    ));

    const state = await coordinator.update(requestFor("selected"));

    expect(state).toEqual({
      status: "error",
      selectedCommits: ["selected"],
      diagnostic,
    });
    expect(JSON.stringify(state)).not.toContain("C:\\Users\\secret");
    expect(JSON.stringify(state)).not.toContain(stderr);
  });

  it.each([
    new Error("C:\\Users\\secret\\prettifer-worktree failed"),
    new GitCommandError(
      ["cherry-pick"],
      128,
      "",
      "fatal: unexpected failure in C:\\Users\\secret\\prettifer-worktree",
    ),
  ])("redacts an unknown calculation failure", async (error) => {
    const coordinator = new CompositeDiffCoordinator(rejectingCalculator(error));

    const state = await coordinator.update(requestFor("selected"));

    expect(state).toEqual({
      status: "error",
      selectedCommits: ["selected"],
      diagnostic: {
        code: "COMPOSITION_FAILED",
        message: "The selected result could not be calculated.",
        nextAction: "Check the repository and selected commits, then try again.",
      },
    });
    expect(JSON.stringify(state)).not.toContain("C:\\Users\\secret");
    expect(JSON.stringify(state)).not.toContain("prettifer-worktree");
  });
});

function rejectingCalculator(error: Error): CompositeDiffCalculator {
  return {
    compose: () => Promise.reject(error),
  };
}

function requestFor(commit: string) {
  return {
    repositoryPath: "C:\\repo",
    baseRef: "main",
    headRef: "feature",
    selectedCommits: [commit],
  } as const;
}
