import type {
  CompositeDiffResultDto,
  Diagnostic,
  RangeResult,
  RepositoryCommitDto,
  RepositoryRangeDto,
  RepositorySession,
} from "../../shared/index.js";

type StableRepositoryState =
  | Readonly<{ status: "empty" }>
  | Readonly<{ status: "ready"; session: RepositorySession }>
  | Readonly<{
      status: "error";
      session: RepositorySession | null;
      diagnostic: Diagnostic;
    }>;

export type RepositoryState = StableRepositoryState | Readonly<{
  status: "selecting";
  requestId: string;
  previous: StableRepositoryState;
}>;

export type RangeState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "loading";
      requestId: string;
      sessionRevision: number;
      baseRef: string;
      headRef: string;
    }>
  | Readonly<{
      status: "ready";
      range: RepositoryRangeDto;
      commits: readonly RepositoryCommitDto[];
      nextOffset: number | null;
      pagination: PaginationState;
    }>
  | Readonly<{
      status: "error";
      baseRef: string;
      headRef: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{
      status: "stale";
      range: RepositoryRangeDto;
      diagnostic: Diagnostic;
    }>;

type PaginationState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; requestId: string }>
  | Readonly<{ status: "error"; diagnostic: Diagnostic }>;

export type CompositionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "loading";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
    }>
  | Readonly<{
      status: "ready";
      requestId: string;
      result: CompositeDiffResultDto;
    }>
  | Readonly<{
      status: "error";
      requestId: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{
      status: "cancelled";
      requestId: string;
    }>;

export interface AppState {
  readonly repository: RepositoryState;
  readonly range: RangeState;
  readonly selectedCommitIds: readonly string[];
  /**
   * Mainline parent number chosen for each merge commit, keyed by commit id.
   * A selected merge commit without an entry still needs the user's choice.
   */
  readonly mergeParents: Readonly<Record<string, number>>;
  readonly inspectedCommitId: string | null;
  readonly composition: CompositionState;
  readonly selectedFilePath: string | null;
}

export type AppAction =
  | Readonly<{ type: "repository/selecting"; requestId: string }>
  | Readonly<{ type: "repository/cancelled"; requestId: string }>
  | Readonly<{
      type: "repository/loaded";
      requestId: string;
      session: RepositorySession;
    }>
  | Readonly<{
      type: "repository/failed";
      requestId: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{
      type: "range/loading";
      requestId: string;
      sessionRevision: number;
      baseRef: string;
      headRef: string;
    }>
  | Readonly<{
      type: "range/loaded";
      requestId: string;
      sessionRevision: number;
      result: RangeResult;
    }>
  | Readonly<{
      type: "range/failed";
      requestId: string;
      sessionRevision: number;
      diagnostic: Diagnostic;
    }>
  | Readonly<{
      type: "range/page-loading";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
    }>
  | Readonly<{
      type: "range/page-loaded";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
      commits: readonly RepositoryCommitDto[];
      nextOffset: number | null;
    }>
  | Readonly<{
      type: "range/page-failed";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{ type: "commit/toggled"; commitId: string }>
  | Readonly<{
      type: "commit/mainlineParentChosen";
      commitId: string;
      mainlineParent: number;
    }>
  | Readonly<{ type: "commit/inspected"; commitId: string }>
  | Readonly<{
      type: "composition/loading";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
    }>
  | Readonly<{
      type: "composition/loaded";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
      result: CompositeDiffResultDto;
    }>
  | Readonly<{
      type: "composition/failed";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{
      type: "composition/cancelled";
      requestId: string;
      sessionRevision: number;
      rangeRevision: string;
    }>
  | Readonly<{ type: "file/selected"; path: string }>;

export const initialAppState: AppState = {
  repository: { status: "empty" },
  range: { status: "idle" },
  selectedCommitIds: [],
  mergeParents: {},
  inspectedCommitId: null,
  composition: { status: "idle" },
  selectedFilePath: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "repository/selecting":
      return {
        ...state,
        repository: {
          status: "selecting",
          requestId: action.requestId,
          previous: stableRepository(state.repository),
        },
      };
    case "repository/cancelled":
      return matchesRepositoryRequest(state.repository, action.requestId)
        ? { ...state, repository: state.repository.previous }
        : state;
    case "repository/loaded":
      return matchesRepositoryRequest(state.repository, action.requestId)
        ? resetForRepository(state, action.session)
        : state;
    case "repository/failed":
      return matchesRepositoryRequest(state.repository, action.requestId)
        ? {
            ...state,
            repository: {
              status: "error",
              session: repositorySession(state.repository.previous),
              diagnostic: action.diagnostic,
            },
          }
        : state;
    case "range/loading":
      return currentSessionRevision(state) === action.sessionRevision
        ? {
            ...state,
            range: {
              status: "loading",
              requestId: action.requestId,
              sessionRevision: action.sessionRevision,
              baseRef: action.baseRef,
              headRef: action.headRef,
            },
            selectedCommitIds: [],
            mergeParents: {},
            inspectedCommitId: null,
            composition: { status: "idle" },
            selectedFilePath: null,
          }
        : state;
    case "range/loaded":
      return matchesRangeRequest(state, action)
        ? {
            ...state,
            range: {
              status: "ready",
              range: action.result.range,
              commits: [...action.result.page.commits],
              nextOffset: action.result.page.nextOffset,
              pagination: { status: "idle" },
            },
          }
        : state;
    case "range/failed":
      return matchesRangeRequest(state, action)
        ? {
            ...state,
            range: {
              status: "error",
              baseRef: state.range.baseRef,
              headRef: state.range.headRef,
              diagnostic: action.diagnostic,
            },
          }
        : state;
    case "range/page-loading":
      return matchesCurrentRange(state, action.sessionRevision, action.rangeRevision) &&
        state.range.status === "ready" &&
        state.range.pagination.status !== "loading"
        ? {
            ...state,
            range: {
              ...state.range,
              pagination: { status: "loading", requestId: action.requestId },
            },
          }
        : state;
    case "range/page-loaded":
      return matchesPaginationRequest(state, action)
        ? {
            ...state,
            range: {
              ...state.range,
              commits: appendUniqueCommits(state.range.commits, action.commits),
              nextOffset: action.nextOffset,
              pagination: { status: "idle" },
            },
          }
        : state;
    case "range/page-failed":
      return matchesPaginationRequest(state, action)
        ? action.diagnostic.code === "RANGE_STALE"
          ? markRangeStale(state, action.diagnostic)
          : {
            ...state,
            range: {
              ...state.range,
              pagination: { status: "error", diagnostic: action.diagnostic },
            },
          }
        : state;
    case "commit/toggled":
      return toggleCommit(state, action.commitId);
    case "commit/mainlineParentChosen":
      return chooseMainlineParent(state, action.commitId, action.mainlineParent);
    case "commit/inspected":
      return hasCommit(state, action.commitId)
        ? { ...state, inspectedCommitId: action.commitId }
        : state;
    case "composition/loading":
      return matchesCurrentRange(state, action.sessionRevision, action.rangeRevision)
        ? {
            ...state,
            composition: {
              status: "loading",
              requestId: action.requestId,
              sessionRevision: action.sessionRevision,
              rangeRevision: action.rangeRevision,
            },
            selectedFilePath: null,
          }
        : state;
    case "composition/loaded":
      return matchesCompositionRequest(state, action)
        ? {
            ...state,
            composition: {
              status: "ready",
              requestId: action.requestId,
              result: action.result,
            },
            selectedFilePath: action.result.files[0]?.path ?? null,
          }
        : state;
    case "composition/failed":
      return matchesCompositionRequest(state, action)
        ? action.diagnostic.code === "RANGE_STALE"
          ? markRangeStale(state, action.diagnostic)
          : {
            ...state,
            composition: {
              status: "error",
              requestId: action.requestId,
              diagnostic: action.diagnostic,
            },
            selectedFilePath: null,
          }
        : state;
    case "composition/cancelled":
      return matchesCompositionRequest(state, action)
        ? {
            ...state,
            composition: { status: "cancelled", requestId: action.requestId },
            selectedFilePath: null,
          }
        : state;
    case "file/selected":
      return hasResultFile(state, action.path)
        ? { ...state, selectedFilePath: action.path }
        : state;
  }
}

function stableRepository(repository: RepositoryState): StableRepositoryState {
  return repository.status === "selecting" ? repository.previous : repository;
}

function matchesRepositoryRequest(
  repository: RepositoryState,
  requestId: string,
): repository is Extract<RepositoryState, { status: "selecting" }> {
  return repository.status === "selecting" && repository.requestId === requestId;
}

function repositorySession(repository: StableRepositoryState): RepositorySession | null {
  switch (repository.status) {
    case "empty":
      return null;
    case "ready":
      return repository.session;
    case "error":
      return repository.session;
  }
}

function currentSessionRevision(state: AppState): number | undefined {
  const repository = stableRepository(state.repository);
  return repositorySession(repository)?.sessionRevision;
}

function resetForRepository(state: AppState, session: RepositorySession): AppState {
  return {
    ...state,
    repository: { status: "ready", session },
    range: { status: "idle" },
    selectedCommitIds: [],
    mergeParents: {},
    inspectedCommitId: null,
    composition: { status: "idle" },
    selectedFilePath: null,
  };
}

function matchesRangeRequest(
  state: AppState,
  action: { readonly requestId: string; readonly sessionRevision: number },
): state is AppState & { range: Extract<RangeState, { status: "loading" }> } {
  return state.range.status === "loading" &&
    state.range.requestId === action.requestId &&
    state.range.sessionRevision === action.sessionRevision &&
    currentSessionRevision(state) === action.sessionRevision;
}

function matchesCurrentRange(
  state: AppState,
  sessionRevision: number,
  rangeRevision: string,
): boolean {
  return state.range.status === "ready" &&
    state.range.range.rangeRevision === rangeRevision &&
    currentSessionRevision(state) === sessionRevision;
}

function matchesCompositionRequest(
  state: AppState,
  action: {
    readonly requestId: string;
    readonly sessionRevision: number;
    readonly rangeRevision: string;
  },
): boolean {
  return state.composition.status === "loading" &&
    state.composition.requestId === action.requestId &&
    state.composition.sessionRevision === action.sessionRevision &&
    state.composition.rangeRevision === action.rangeRevision &&
    matchesCurrentRange(state, action.sessionRevision, action.rangeRevision);
}

function hasCommit(state: AppState, commitId: string): boolean {
  return state.range.status === "ready" &&
    state.range.commits.some((commit) => commit.id === commitId);
}

function toggleCommit(state: AppState, commitId: string): AppState {
  if (state.range.status !== "ready") {
    return state;
  }
  const commit = state.range.commits.find((candidate) => candidate.id === commitId);
  if (commit?.selectable !== true) {
    return state;
  }
  const isSelected = state.selectedCommitIds.includes(commitId);
  return {
    ...state,
    selectedCommitIds: isSelected
      ? state.selectedCommitIds.filter((id) => id !== commitId)
      : [...state.selectedCommitIds, commitId],
    mergeParents: isSelected
      ? withoutMergeParent(state.mergeParents, commitId)
      : state.mergeParents,
    composition: { status: "idle" },
    selectedFilePath: null,
  };
}

function chooseMainlineParent(
  state: AppState,
  commitId: string,
  mainlineParent: number,
): AppState {
  if (state.range.status !== "ready") {
    return state;
  }
  const commit = state.range.commits.find((candidate) => candidate.id === commitId);
  if (commit?.isMerge !== true) {
    return state;
  }
  if (mainlineParent < 1 || mainlineParent > commit.parentIds.length) {
    return state;
  }
  return {
    ...state,
    mergeParents: { ...state.mergeParents, [commitId]: mainlineParent },
    composition: { status: "idle" },
    selectedFilePath: null,
  };
}

function withoutMergeParent(
  mergeParents: Readonly<Record<string, number>>,
  commitId: string,
): Readonly<Record<string, number>> {
  if (!(commitId in mergeParents)) {
    return mergeParents;
  }
  return Object.fromEntries(
    Object.entries(mergeParents).filter(([id]) => id !== commitId),
  );
}

/**
 * A problem file is reviewable too, so it is selectable even though it has no
 * composed contents.
 */
function hasResultFile(state: AppState, path: string): boolean {
  if (state.composition.status !== "ready") {
    return false;
  }
  const { files, problemFiles } = state.composition.result;
  return files.some((file) => file.path === path)
    || problemFiles.some((problem) => problem.path === path);
}

function markRangeStale(state: AppState, diagnostic: Diagnostic): AppState {
  if (state.range.status !== "ready") {
    return state;
  }
  return {
    ...state,
    range: { status: "stale", range: state.range.range, diagnostic },
    selectedCommitIds: [],
    mergeParents: {},
    inspectedCommitId: null,
    composition: { status: "idle" },
    selectedFilePath: null,
  };
}

function matchesPaginationRequest(
  state: AppState,
  action: {
    readonly requestId: string;
    readonly sessionRevision: number;
    readonly rangeRevision: string;
  },
): state is AppState & { range: Extract<RangeState, { status: "ready" }> } {
  return matchesCurrentRange(state, action.sessionRevision, action.rangeRevision) &&
    state.range.status === "ready" &&
    state.range.pagination.status === "loading" &&
    state.range.pagination.requestId === action.requestId;
}

function appendUniqueCommits(
  current: readonly RepositoryCommitDto[],
  additional: readonly RepositoryCommitDto[],
): readonly RepositoryCommitDto[] {
  const known = new Set(current.map((commit) => commit.id));
  return [
    ...current,
    ...additional.filter((commit) => !known.has(commit.id)),
  ];
}
