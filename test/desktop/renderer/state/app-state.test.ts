import { describe, expect, it } from "vitest";

import {
  appReducer,
  initialAppState,
} from "../../../../src/desktop/renderer/state/app-state.js";
import {
  selectRepositorySession,
} from "../../../../src/desktop/renderer/state/app-selectors.js";

const repositorySessionId = "00000000-0000-4000-8000-000000000001";
const baseCommit = "b".repeat(40);
const headCommit = "a".repeat(40);
const commonCommit = "c".repeat(40);
const session = {
  repositorySessionId,
  sessionRevision: 1,
  rootPath: "C:\\work\\repo",
  currentBranch: "feature/ui",
  branches: [
    { name: "main", commitId: baseCommit, isCurrent: false },
    { name: "feature/ui", commitId: headCommit, isCurrent: true },
  ],
};
const range = {
  baseRef: "main",
  baseRefCommit: baseCommit,
  headRef: "feature/ui",
  headCommit,
  baseCommit: commonCommit,
  rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
};
const commits = [
  {
    id: "d".repeat(40),
    shortId: "d".repeat(7),
    parentIds: [commonCommit],
    title: "first",
    authorName: "Prettifer Test",
    authoredAt: "2026-07-23T00:00:00.000Z",
    isMerge: false,
    selectable: true,
  },
  {
    id: "e".repeat(40),
    shortId: "e".repeat(7),
    parentIds: ["d".repeat(40)],
    title: "merge",
    authorName: "Prettifer Test",
    authoredAt: "2026-07-23T00:01:00.000Z",
    isMerge: true,
    selectable: false,
  },
];

function readyState() {
  const selecting = appReducer(initialAppState, {
    type: "repository/selecting",
    requestId: "repository-1",
  });
  const withRepository = appReducer(selecting, {
    type: "repository/loaded",
    requestId: "repository-1",
    session,
  });
  const loadingRange = appReducer(withRepository, {
    type: "range/loading",
    requestId: "range-1",
    sessionRevision: 1,
    baseRef: "main",
    headRef: "feature/ui",
  });
  return appReducer(loadingRange, {
    type: "range/loaded",
    requestId: "range-1",
    sessionRevision: 1,
    result: {
      range,
      page: { rangeRevision: range.rangeRevision, commits, nextOffset: null },
    },
  });
}

describe("app reducer", () => {
  it("represents the initial repository, range and composition as idle", () => {
    expect(initialAppState).toMatchObject({
      repository: { status: "empty" },
      range: { status: "idle" },
      composition: { status: "idle" },
      selectedCommitIds: [],
      inspectedCommitId: null,
      selectedFilePath: null,
    });
  });

  it("keeps the previous repository state when folder selection is cancelled", () => {
    const current = readyState();
    const selecting = appReducer(current, {
      type: "repository/selecting",
      requestId: "repository-2",
    });
    const cancelled = appReducer(selecting, {
      type: "repository/cancelled",
      requestId: "repository-2",
    });

    expect(selectRepositorySession(selecting.repository)).toEqual(session);
    expect(cancelled).toEqual(current);
  });

  it("clears all repository-dependent state after opening another repository", () => {
    const current = appReducer(readyState(), {
      type: "commit/toggled",
      commitId: commits[0]!.id,
    });
    const selecting = appReducer(current, {
      type: "repository/selecting",
      requestId: "repository-2",
    });
    const next = appReducer(selecting, {
      type: "repository/loaded",
      requestId: "repository-2",
      session: { ...session, repositorySessionId: "00000000-0000-4000-8000-000000000002", sessionRevision: 2 },
    });

    expect(next.range).toEqual({ status: "idle" });
    expect(next.selectedCommitIds).toEqual([]);
    expect(next.inspectedCommitId).toBeNull();
    expect(next.composition).toEqual({ status: "idle" });
    expect(next.selectedFilePath).toBeNull();
  });

  it("separates composition selection, inspected commit and selected file", () => {
    const selected = appReducer(readyState(), {
      type: "commit/toggled",
      commitId: commits[0]!.id,
    });
    const inspected = appReducer(selected, {
      type: "commit/inspected",
      commitId: commits[1]!.id,
    });

    expect(inspected.selectedCommitIds).toEqual([commits[0]!.id]);
    expect(inspected.range.status === "ready"
      ? inspected.range.commits.find((commit) => commit.id === inspected.inspectedCommitId)
      : null).toEqual(commits[1]);
    expect(inspected.selectedFilePath).toBeNull();
    expect(inspected.selectedCommitIds).toHaveLength(1);
  });

  it("does not select a merge commit", () => {
    const state = appReducer(readyState(), {
      type: "commit/toggled",
      commitId: commits[1]!.id,
    });
    expect(state.selectedCommitIds).toEqual([]);
  });

  it("clears selection and results when the branch range changes", () => {
    let state = appReducer(readyState(), {
      type: "commit/toggled",
      commitId: commits[0]!.id,
    });
    state = appReducer(state, {
      type: "commit/inspected",
      commitId: commits[0]!.id,
    });
    state = appReducer(state, {
      type: "composition/loading",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    state = appReducer(state, {
      type: "range/loading",
      requestId: "range-2",
      sessionRevision: 1,
      baseRef: "release",
      headRef: "feature/ui",
    });

    expect(state.selectedCommitIds).toEqual([]);
    expect(state.inspectedCommitId).toBeNull();
    expect(state.composition).toEqual({ status: "idle" });
    expect(state.selectedFilePath).toBeNull();
  });

  it("applies only responses with the current request and revisions", () => {
    const loading = appReducer(readyState(), {
      type: "composition/loading",
      requestId: "composition-2",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    const late = appReducer(loading, {
      type: "composition/loaded",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
      result: {
        baseCommit: commonCommit,
        selectedCommits: [commits[0]!.id],
        files: [{
          path: "src/old.ts",
          status: "modified",
          beforeContent: "old",
          afterContent: "new",
        }],
        mainlineParents: {},
        problemFiles: [],
        unifiedDiff: "diff",
      },
    });
    const wrongRevision = appReducer(loading, {
      type: "composition/loaded",
      requestId: "composition-2",
      sessionRevision: 1,
      rangeRevision: "stale",
      result: {
        baseCommit: commonCommit,
        selectedCommits: [commits[0]!.id],
        files: [],
        mainlineParents: {},
        problemFiles: [],
        unifiedDiff: "",
      },
    });

    expect(late).toEqual(loading);
    expect(wrongRevision).toEqual(loading);
  });

  it("selects the first result file", () => {
    const loading = appReducer(readyState(), {
      type: "composition/loading",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    const loaded = appReducer(loading, {
      type: "composition/loaded",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
      result: {
        baseCommit: commonCommit,
        selectedCommits: [commits[0]!.id],
        files: [{
          path: "src/app.ts",
          status: "added",
          beforeContent: null,
          afterContent: "export {};",
        }],
        mainlineParents: {},
        problemFiles: [],
        unifiedDiff: "diff",
      },
    });
    expect(loaded.selectedFilePath).toBe("src/app.ts");
  });

  it("selects a problem file for review but rejects an unknown path", () => {
    const loading = appReducer(readyState(), {
      type: "composition/loading",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    const loaded = appReducer(loading, {
      type: "composition/loaded",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
      result: {
        baseCommit: commonCommit,
        selectedCommits: [commits[0]!.id],
        files: [{
          path: "src/app.ts",
          status: "modified",
          beforeContent: "before",
          afterContent: "after",
        }],
        mainlineParents: {},
        problemFiles: [{
          path: "src/broken.ts",
          code: "CONTENT_CHOICE_REQUIRED",
          commit: commits[0]!.id,
          nextAction: "Select the prerequisite commits, then build the result again.",
        }],
        unifiedDiff: "diff",
      },
    });

    const problem = appReducer(loaded, { type: "file/selected", path: "src/broken.ts" });
    expect(problem.selectedFilePath).toBe("src/broken.ts");
    expect(appReducer(problem, { type: "file/selected", path: "src/absent.ts" }))
      .toBe(problem);
  });

  it("keeps cancellation visible and ignores a late cancellation from an older request", () => {
    const firstLoading = appReducer(readyState(), {
      type: "composition/loading",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    const cancelled = appReducer(firstLoading, {
      type: "composition/cancelled",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    expect(cancelled.composition).toEqual({
      status: "cancelled",
      requestId: "composition-1",
    });

    const secondLoading = appReducer(cancelled, {
      type: "composition/loading",
      requestId: "composition-2",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    const lateCancellation = appReducer(secondLoading, {
      type: "composition/cancelled",
      requestId: "composition-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    expect(lateCancellation).toEqual(secondLoading);
  });

  it("invalidates selected commits when pagination reports a stale range", () => {
    let state = appReducer(readyState(), {
      type: "commit/toggled",
      commitId: commits[0]!.id,
    });
    state = appReducer(state, {
      type: "range/page-loading",
      requestId: "page-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });
    state = appReducer(state, {
      type: "range/page-failed",
      requestId: "page-1",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
      diagnostic: {
        code: "RANGE_STALE",
        message: "The branch history has changed.",
        nextAction: "Reload the branch history.",
      },
    });

    expect(state.range).toMatchObject({ status: "stale", range });
    expect(state.selectedCommitIds).toEqual([]);
    expect(state.composition).toEqual({ status: "idle" });
  });
});
