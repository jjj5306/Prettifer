import { describe, expect, it } from "vitest";

import {
  CompositeDiffCoordinator,
  type CompositeDiffCalculator,
  type CompositeDiffResult,
} from "../../src/composition/composite-diff-coordinator.js";
import { SelectionError } from "../../src/composition/selection-planner.js";

const result = (commit: string): CompositeDiffResult => ({
  baseCommit: "base",
  selectedCommits: [commit],
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
});

function requestFor(commit: string) {
  return {
    repositoryPath: "C:\\repo",
    baseRef: "main",
    headRef: "feature",
    selectedCommits: [commit],
  } as const;
}
