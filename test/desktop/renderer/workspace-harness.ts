import { vi } from "vitest";

import type { AppController } from "../../../src/desktop/renderer/controller/use-app-controller.js";
import type {
  AppState,
  FileCommitState,
  FileHistoryState,
} from "../../../src/desktop/renderer/state/app-state.js";

export const firstCommit = {
  id: "a".repeat(40),
  shortId: "a".repeat(7),
  parents: [{ id: "b".repeat(40), shortId: "b".repeat(7), title: null }],
  title: "add desktop shell",
  authorName: "Prettifer Test",
  authoredAt: "2026-07-23T00:00:00.000Z",
  isMerge: false,
  selectable: true,
};
export const baseCommit = "b".repeat(40);
export const headCommit = firstCommit.id;
export const commonCommit = "c".repeat(40);
export const rangeRevision = `${baseCommit}:${headCommit}:${commonCommit}`;
export const reviewedPath = "src/app.ts";

/** The reviewed file's history, as it reads once the list has arrived. */
export const readyFileHistory: FileHistoryState = {
  status: "ready",
  rangeRevision,
  path: reviewedPath,
  entries: [{
    id: firstCommit.id,
    shortId: firstCommit.shortId,
    parents: [commonCommit],
    title: firstCommit.title,
    authorName: firstCommit.authorName,
    authoredAt: firstCommit.authoredAt,
    status: "modified",
    path: reviewedPath,
  }],
  nextOffset: null,
  partial: null,
  pagination: { status: "idle" },
  focusedCommitId: firstCommit.id,
};

/** One commit of that history, opened for review. */
export const openFileCommit: FileCommitState = {
  status: "ready",
  requestId: "file-commit-1",
  rangeRevision,
  change: {
    commitId: firstCommit.id,
    parentCommit: commonCommit,
    parentNumber: 1,
    path: reviewedPath,
    status: "modified",
    binary: false,
    beforeContent: "before",
    afterContent: "after",
    beforeSize: 6,
    afterSize: 5,
  },
};

/**
 * The controller the workbench sees, with every action stubbed. `state` overrides
 * whatever the two flags produced, so a test can start from a review step such as
 * an open file history without restating the whole tree.
 */
export function createController(
  withResult = false,
  withSelectedFile = withResult,
  state: Partial<AppState> = {},
): AppController {
  const result = {
    baseCommit: commonCommit,
    selectedCommits: [firstCommit.id],
    files: [
      {
        path: "src/app.ts",
        status: "modified" as const,
        beforeContent: "before",
        afterContent: "after",
      },
    ],
    mainlineParents: {},
    problemFiles: [],
    unifiedDiff: "diff",
  };
  return {
    state: {
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
      range: {
        status: "ready",
        range: {
          baseRef: "main",
          baseRefCommit: baseCommit,
          headRef: "feature/ui",
          headCommit,
          baseCommit: commonCommit,
          rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
        },
        commits: [firstCommit],
        nextOffset: null,
        firstPageOffset: null,
        pagination: { status: "idle" },
      },
      selectedCommitIds: withResult ? [firstCommit.id] : [],
      mergeParents: {},
      inspectedCommitId: null,
      composition: withResult
        ? { status: "ready", requestId: "composition-1", result }
        : { status: "idle" },
      selectedFilePath: withSelectedFile ? "src/app.ts" : null,
      fileHistory: { status: "idle" },
      fileCommit: { status: "idle" },
      symbolLookup: { status: "idle" },
      groupingRules: {
        status: "ready",
        rules: [{ prefix: "src", name: "Source" }],
        saveDiagnostic: null,
      },
      baseTree: { status: "idle" },
      externalFile: { status: "idle" },
      reveal: null,
      navigationHistory: [],
      appInfo: { status: "idle" },
      ...state,
    },
    openRepository: vi.fn(),
    loadRange: vi.fn(),
    loadMoreCommits: vi.fn(),
    toggleCommit: vi.fn(),
    resetLoadedCommits: vi.fn(),
    clearCommitSelection: vi.fn(),
    inspectCommit: vi.fn(),
    chooseMainlineParent: vi.fn(),
    composeSelection: vi.fn(),
    cancelComposition: vi.fn(),
    selectFile: vi.fn(),
    loadFileHistory: vi.fn().mockResolvedValue(undefined),
    loadMoreFileHistory: vi.fn().mockResolvedValue(undefined),
    openFileCommit: vi.fn().mockResolvedValue(undefined),
    closeFileCommit: vi.fn(),
    closeFileHistory: vi.fn(),
    loadAppInfo: vi.fn().mockResolvedValue(undefined),
    focusFileHistoryCommit: vi.fn(),
    lookUpSymbol: vi.fn().mockResolvedValue(undefined),
    goToHit: vi.fn(),
    dismissSymbolLookup: vi.fn(),
    goBack: vi.fn(),
    loadBaseTree: vi.fn().mockResolvedValue(undefined),
    saveGroupingRules: vi.fn().mockResolvedValue(undefined),
  };
}
