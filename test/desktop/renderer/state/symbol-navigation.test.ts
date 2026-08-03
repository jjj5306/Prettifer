import { describe, expect, it } from "vitest";

import type { AppState } from "../../../../src/desktop/renderer/state/app-state.js";
import {
  appReducer,
  initialAppState,
} from "../../../../src/desktop/renderer/state/app-state.js";

const baseCommit = "b".repeat(40);
const headCommit = "a".repeat(40);
const commonCommit = "c".repeat(40);
const range = {
  baseRef: "main",
  baseRefCommit: baseCommit,
  headRef: "feature/ui",
  headCommit,
  baseCommit: commonCommit,
  rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
};

/** A review with a lookup for `symbol` already running. */
function lookingState(
  symbol: string,
  mode: "definition" | "references" = "references",
): AppState {
  return appReducer(reviewingState(), { type: "symbol/looking", symbol, mode });
}

/** A review in progress: two result files and one problem file. */
function reviewingState(selectedFilePath = "src/Caller.java"): AppState {
  return {
    ...initialAppState,
    repository: {
      status: "ready",
      session: {
        repositorySessionId: "00000000-0000-4000-8000-000000000001",
        sessionRevision: 1,
        rootPath: "C:\\work\\repo",
        currentBranch: "feature/ui",
        branches: [
          { name: "main", commitId: baseCommit, isCurrent: false },
          { name: "feature/ui", commitId: headCommit, isCurrent: true },
        ],
      },
    },
    range: { status: "ready", range, commits: [], nextOffset: null, pagination: { status: "idle" } },
    composition: {
      status: "ready",
      requestId: "composition-1",
      result: {
        baseCommit: commonCommit,
        selectedCommits: [headCommit],
        files: [
          {
            path: "src/Caller.java",
            status: "modified",
            beforeContent: "before",
            afterContent: "new UtVar();",
          },
          {
            path: "src/UtVar.java",
            status: "added",
            beforeContent: null,
            afterContent: "public class UtVar {}",
          },
        ],
        mainlineParents: {},
        problemFiles: [{
          path: "src/broken.java",
          code: "CONTENT_CHOICE_REQUIRED",
          commit: headCommit,
          nextAction: "Select the prerequisite commits, then build the result again.",
        }],
        unifiedDiff: "diff",
      },
    },
    selectedFilePath,
  };
}

const hit = {
  path: "src/UtVar.java",
  line: 12,
  text: "public class UtVar {}",
  isDeclaration: true,
};

describe("symbol lookup state", () => {
  it("starts idle", () => {
    expect(initialAppState.symbolLookup).toEqual({ status: "idle" });
    expect(initialAppState.revealLine).toBeNull();
    expect(initialAppState.navigationHistory).toEqual([]);
  });

  it("keeps the symbol while the search runs so the panel can name it", () => {
    const state = appReducer(reviewingState(), { type: "symbol/looking", symbol: "UtVar", mode: "references" });

    expect(state.symbolLookup).toEqual({ status: "loading", symbol: "UtVar", mode: "references" });
  });

  it("reports an empty result instead of an empty list", () => {
    const state = appReducer(lookingState("UtVar"), {
      type: "symbol/found",
      symbol: "UtVar",
      mode: "references",
      hits: [],
      truncated: false,
    });

    expect(state.symbolLookup).toEqual({ status: "empty", symbol: "UtVar", mode: "references" });
  });

  it("carries hits and the truncation flag", () => {
    const state = appReducer(lookingState("UtVar"), {
      type: "symbol/found",
      symbol: "UtVar",
      mode: "references",
      hits: [hit],
      truncated: true,
    });

    expect(state.symbolLookup).toEqual({
      status: "ready",
      symbol: "UtVar",
      mode: "references",
      hits: [hit],
      truncated: true,
    });
  });

  it("names the file whose language the search does not understand", () => {
    const state = appReducer(reviewingState(), {
      type: "symbol/unsupported",
      path: "docs/readme.md",
    });

    expect(state.symbolLookup).toEqual({ status: "unsupported", path: "docs/readme.md" });
  });

  it("keeps a failure diagnostic for the panel", () => {
    const diagnostic = {
      code: "SYMBOL_SEARCH_FAILED",
      message: "The symbol search could not run.",
      nextAction: "Build the result again, then retry the search.",
    };
    const state = appReducer(lookingState("UtVar"), {
      type: "symbol/failed",
      symbol: "UtVar",
      diagnostic,
    });

    expect(state.symbolLookup).toEqual({ status: "error", symbol: "UtVar", diagnostic });
  });

  it("ignores the answer to a question that is no longer the current one", () => {
    const looking = lookingState("total");
    const stale = appReducer(looking, {
      type: "symbol/found",
      symbol: "UtVar",
      mode: "references",
      hits: [hit],
      truncated: false,
    });
    const staleFailure = appReducer(looking, {
      type: "symbol/failed",
      symbol: "UtVar",
      diagnostic: {
        code: "SYMBOL_SEARCH_FAILED",
        message: "The symbol search could not run.",
        nextAction: "Build the result again, then retry the search.",
      },
    });
    const otherMode = appReducer(looking, {
      type: "symbol/found",
      symbol: "total",
      mode: "definition",
      hits: [hit],
      truncated: false,
    });

    expect(stale).toBe(looking);
    expect(staleFailure).toBe(looking);
    expect(otherMode).toBe(looking);
  });

  it("returns to idle when dismissed", () => {
    const found = appReducer(lookingState("UtVar"), {
      type: "symbol/found",
      symbol: "UtVar",
      mode: "references",
      hits: [hit],
      truncated: false,
    });

    expect(appReducer(found, { type: "symbol/dismissed" }).symbolLookup)
      .toEqual({ status: "idle" });
  });
});

describe("symbol navigation", () => {
  it("opens the target file at the target line", () => {
    const state = appReducer(reviewingState(), {
      type: "symbol/navigated",
      path: "src/UtVar.java",
      line: 12,
    });

    expect(state.selectedFilePath).toBe("src/UtVar.java");
    expect(state.revealLine).toBe(12);
  });

  it("remembers where the review was, so it can be reached again", () => {
    const state = appReducer(reviewingState(), {
      type: "symbol/navigated",
      path: "src/UtVar.java",
      line: 12,
    });

    expect(state.navigationHistory).toEqual([{ path: "src/Caller.java", line: 1 }]);
  });

  it("returns to the exact line the navigation left", () => {
    const away = appReducer(
      appReducer(reviewingState(), {
        type: "symbol/navigated",
        path: "src/Caller.java",
        line: 30,
      }),
      { type: "symbol/navigated", path: "src/UtVar.java", line: 12 },
    );
    const back = appReducer(away, { type: "symbol/back" });

    expect(back.selectedFilePath).toBe("src/Caller.java");
    expect(back.revealLine).toBe(30);
    expect(back.navigationHistory).toEqual([{ path: "src/Caller.java", line: 1 }]);
  });

  it("does nothing when there is nowhere to go back to", () => {
    const state = reviewingState();

    expect(appReducer(state, { type: "symbol/back" })).toBe(state);
  });

  it("reaches a problem file, which is reviewable too", () => {
    const state = appReducer(reviewingState(), {
      type: "symbol/navigated",
      path: "src/broken.java",
      line: 3,
    });

    expect(state.selectedFilePath).toBe("src/broken.java");
  });

  it("refuses a file outside the result rather than showing an empty review", () => {
    const state = reviewingState();

    expect(appReducer(state, {
      type: "symbol/navigated",
      path: "src/absent.java",
      line: 1,
    })).toBe(state);
  });

  it("drops the lookup and the way back when a file is picked by hand", () => {
    const away = appReducer(
      appReducer(lookingState("UtVar"), {
        type: "symbol/found",
        symbol: "UtVar",
        mode: "references",
        hits: [hit],
        truncated: false,
      }),
      { type: "symbol/navigated", path: "src/UtVar.java", line: 12 },
    );
    const picked = appReducer(away, { type: "file/selected", path: "src/Caller.java" });

    expect(picked.symbolLookup).toEqual({ status: "idle" });
    expect(picked.revealLine).toBeNull();
    expect(picked.navigationHistory).toEqual([]);
  });

  it("drops the lookup and the way back when a new result is built", () => {
    const away = appReducer(
      appReducer(lookingState("UtVar"), {
        type: "symbol/found",
        symbol: "UtVar",
        mode: "references",
        hits: [hit],
        truncated: false,
      }),
      { type: "symbol/navigated", path: "src/UtVar.java", line: 12 },
    );
    const rebuilt = appReducer(away, {
      type: "composition/loading",
      requestId: "composition-2",
      sessionRevision: 1,
      rangeRevision: range.rangeRevision,
    });

    expect(rebuilt.composition).toMatchObject({ status: "loading" });
    expect(rebuilt.symbolLookup).toEqual({ status: "idle" });
    expect(rebuilt.revealLine).toBeNull();
    expect(rebuilt.navigationHistory).toEqual([]);
  });
});
