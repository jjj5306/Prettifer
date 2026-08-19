import type {
  BaseTreeDto,
  CompositeDiffResultDto,
  Diagnostic,
  FileCommitChangeDto,
  FileHistoryEntryDto,
  FileHistoryPageDto,
  GroupRuleDto,
  RangeResult,
  RepositoryCommitDto,
  RepositoryRangeDto,
  RepositorySession,
  SymbolHitDto,
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
      /**
       * Commits the first page held, remembered when the range loaded. Resetting
       * the list keeps that many, so the page size stays a main-process decision
       * instead of being restated here. Null when the first page was the last.
       */
      firstPageOffset: number | null;
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
  readonly fileHistory: FileHistoryState;
  readonly fileCommit: FileCommitState;
  readonly symbolLookup: SymbolLookupState;
  readonly groupingRules: GroupingRulesState;
  readonly baseTree: BaseTreeState;
  readonly externalFile: ExternalFileState;
  /** Position the review should reveal, set by a symbol navigation. */
  readonly reveal: ReviewPosition | null;
  /** Positions to return to, newest last. */
  readonly navigationHistory: readonly ReviewPosition[];
  readonly appInfo: AppInfoState;
}

/**
 * What the running application says about itself. Read when the introduction
 * screen is first opened, because nothing else on the workbench needs it.
 */
export type AppInfoState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; version: string }>
  | Readonly<{ status: "error"; diagnostic: Diagnostic }>;

export type FileHistoryState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "loading";
      requestId: string;
      rangeRevision: string;
      path: string;
    }>
  | Readonly<{
      status: "ready";
      rangeRevision: string;
      path: string;
      entries: readonly FileHistoryEntryDto[];
      nextOffset: number | null;
      partial: FileHistoryPageDto["partial"];
      pagination: PaginationState;
      focusedCommitId: string | null;
    }>
  | Readonly<{
      status: "error";
      rangeRevision: string;
      path: string;
      diagnostic: Diagnostic;
    }>;

export type FileCommitState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "loading";
      requestId: string;
      rangeRevision: string;
      path: string;
      commitId: string;
    }>
  | Readonly<{
      status: "ready";
      requestId: string;
      rangeRevision: string;
      change: FileCommitChangeDto;
    }>
  | Readonly<{
      status: "error";
      requestId: string;
      rangeRevision: string;
      path: string;
      commitId: string;
      diagnostic: Diagnostic;
    }>;

/**
 * The grouping rules of the open repository, as the settings file holds them.
 * An edit stays in `ready` even when saving it failed, so a save the settings
 * folder refused never costs the user the rule they just wrote.
 */
export type GroupingRulesState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; requestId: string }>
  | Readonly<{
      status: "ready";
      rules: readonly GroupRuleDto[];
      /** Set when the last edit did not reach the settings file. */
      saveDiagnostic: Diagnostic | null;
    }>
  | Readonly<{ status: "error"; diagnostic: Diagnostic }>;

/**
 * The paths tracked at the comparison base, read once per range when the review
 * first shows the whole repository structure. `rangeRevision` is what makes a
 * list belong to a range: a new range never reuses the previous answer.
 */
export type BaseTreeState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; requestId: string; rangeRevision: string }>
  | Readonly<{
      status: "ready";
      rangeRevision: string;
      paths: readonly string[];
      /** True when the limit cut the list, so the screen can say so. */
      truncated: boolean;
    }>
  | Readonly<{ status: "error"; rangeRevision: string; diagnostic: Diagnostic }>;

export interface ReviewPosition {
  readonly path: string;
  readonly line: number;
  /** 1-based column of the symbol on that line, 1 when there is none. */
  readonly column: number;
}

/**
 * What the user asked for. One repository search answers both, but a request for
 * the declaration is narrowed to declarations and jumps straight there when it
 * finds exactly one.
 */
export type SymbolLookupMode = "definition" | "references";

/**
 * A symbol lookup. `unsupported` and `empty` are distinct because the first says
 * the file type has no symbol search and the second says the search ran and found
 * nothing, which lead to different next actions.
 */
export type SymbolLookupState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; symbol: string; mode: SymbolLookupMode }>
  | Readonly<{
      status: "ready";
      symbol: string;
      mode: SymbolLookupMode;
      hits: readonly SymbolHitDto[];
      truncated: boolean;
    }>
  | Readonly<{ status: "empty"; symbol: string; mode: SymbolLookupMode }>
  | Readonly<{ status: "unsupported"; path: string }>
  | Readonly<{ status: "error"; symbol: string; diagnostic: Diagnostic }>;

/**
 * A file opened by a navigation that the selection never changed. It is not in
 * the composed result, so it is read at the comparison base and shown on its own
 * instead of as a diff.
 */
export type ExternalFileState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; path: string }>
  | Readonly<{ status: "ready"; path: string; contents: string }>
  | Readonly<{ status: "error"; path: string; diagnostic: Diagnostic }>;

export type AppAction =
  | Readonly<{
      type: "fileHistory/loading";
      requestId: string;
      rangeRevision: string;
      path: string;
    }>
  | Readonly<{
      type: "fileHistory/loaded";
      requestId: string;
      rangeRevision: string;
      page: FileHistoryPageDto;
    }>
  | Readonly<{
      type: "fileHistory/failed";
      requestId: string;
      rangeRevision: string;
      path: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{ type: "fileHistory/focused"; commitId: string }>
  | Readonly<{
      type: "fileHistory/page-loading";
      requestId: string;
      rangeRevision: string;
      path: string;
    }>
  | Readonly<{
      type: "fileHistory/page-loaded";
      requestId: string;
      rangeRevision: string;
      path: string;
      page: FileHistoryPageDto;
    }>
  | Readonly<{
      type: "fileHistory/page-failed";
      requestId: string;
      rangeRevision: string;
      path: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{
      type: "fileCommit/loading";
      requestId: string;
      rangeRevision: string;
      path: string;
      commitId: string;
    }>
  | Readonly<{
      type: "fileCommit/loaded";
      requestId: string;
      rangeRevision: string;
      change: FileCommitChangeDto;
    }>
  | Readonly<{
      type: "fileCommit/failed";
      requestId: string;
      rangeRevision: string;
      path: string;
      commitId: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{ type: "appInfo/loading" }>
  | Readonly<{ type: "appInfo/loaded"; version: string }>
  | Readonly<{ type: "appInfo/failed"; diagnostic: Diagnostic }>
  | Readonly<{ type: "fileHistory/closed" }>
  | Readonly<{ type: "fileCommit/closed" }>
  | Readonly<{ type: "symbol/looking"; symbol: string; mode: SymbolLookupMode }>
  | Readonly<{
      type: "symbol/found";
      symbol: string;
      mode: SymbolLookupMode;
      hits: readonly SymbolHitDto[];
      truncated: boolean;
    }>
  | Readonly<{ type: "symbol/unsupported"; path: string }>
  | Readonly<{ type: "symbol/failed"; symbol: string; diagnostic: Diagnostic }>
  | Readonly<{ type: "symbol/dismissed" }>
  | Readonly<{ type: "symbol/navigated"; path: string; line: number; column: number }>
  | Readonly<{ type: "symbol/back" }>
  | Readonly<{
      type: "external/opening";
      path: string;
      line: number;
      column: number;
      /**
       * False when going back, because that position was just taken off the
       * history and must not be pushed onto it again.
       */
      remember: boolean;
    }>
  | Readonly<{ type: "external/opened"; path: string; contents: string }>
  | Readonly<{ type: "external/failed"; path: string; diagnostic: Diagnostic }>
  | Readonly<{ type: "baseTree/loading"; requestId: string; rangeRevision: string }>
  | Readonly<{
      type: "baseTree/loaded";
      requestId: string;
      rangeRevision: string;
      tree: BaseTreeDto;
    }>
  | Readonly<{
      type: "baseTree/failed";
      requestId: string;
      rangeRevision: string;
      diagnostic: Diagnostic;
    }>
  | Readonly<{ type: "rules/loading"; requestId: string }>
  | Readonly<{ type: "rules/loaded"; requestId: string; rules: readonly GroupRuleDto[] }>
  | Readonly<{ type: "rules/failed"; requestId: string; diagnostic: Diagnostic }>
  | Readonly<{ type: "rules/changed"; rules: readonly GroupRuleDto[] }>
  | Readonly<{ type: "rules/saveFailed"; diagnostic: Diagnostic }>
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
  | Readonly<{ type: "range/loadedPagesReset" }>
  | Readonly<{ type: "commit/selectionCleared" }>
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
  fileHistory: { status: "idle" },
  fileCommit: { status: "idle" },
  symbolLookup: { status: "idle" },
  groupingRules: { status: "idle" },
  baseTree: { status: "idle" },
  externalFile: { status: "idle" },
  reveal: null,
  navigationHistory: [],
  appInfo: { status: "idle" },
};

/** Symbol lookup and navigation belong to one review target; a new target clears them. */
const clearedSymbolNavigation = {
  symbolLookup: { status: "idle" },
  externalFile: { status: "idle" },
  reveal: null,
  navigationHistory: [],
} as const satisfies Pick<
  AppState,
  "symbolLookup" | "externalFile" | "reveal" | "navigationHistory"
>;

const clearedFileReview = {
  fileHistory: { status: "idle" },
  fileCommit: { status: "idle" },
} as const satisfies Pick<AppState, "fileHistory" | "fileCommit">;

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "fileHistory/loading":
      return {
        ...state,
        fileHistory: {
          status: "loading",
          requestId: action.requestId,
          rangeRevision: action.rangeRevision,
          path: action.path,
        },
      };
    case "fileHistory/loaded":
      return matchesFileHistoryRequest(state, action)
        ? {
            ...state,
            fileHistory: {
              status: "ready",
              rangeRevision: action.rangeRevision,
              path: action.page.path,
              entries: action.page.entries,
              nextOffset: action.page.nextOffset,
              partial: action.page.partial,
              pagination: { status: "idle" },
              focusedCommitId: action.page.entries.at(-1)?.id ?? null,
            },
          }
        : state;
    case "fileHistory/failed":
      return matchesFileHistoryRequest(state, action)
        ? {
            ...state,
            fileHistory: {
              status: "error",
              rangeRevision: action.rangeRevision,
              path: action.path,
              diagnostic: action.diagnostic,
            },
          }
        : state;
    case "fileHistory/focused":
      return state.fileHistory.status === "ready" &&
        state.fileHistory.entries.some((entry) => entry.id === action.commitId)
        ? { ...state, fileHistory: { ...state.fileHistory, focusedCommitId: action.commitId } }
        : state;
    case "fileHistory/page-loading":
      return state.fileHistory.status === "ready" &&
        state.fileHistory.path === action.path &&
        state.fileHistory.rangeRevision === action.rangeRevision &&
        state.fileHistory.pagination.status !== "loading"
        ? {
            ...state,
            fileHistory: {
              ...state.fileHistory,
              pagination: { status: "loading", requestId: action.requestId },
            },
          }
        : state;
    case "fileHistory/page-loaded":
      return matchesFileHistoryPageRequest(state, action)
        ? {
            ...state,
            fileHistory: {
              ...state.fileHistory,
              entries: appendUniqueFileHistory(
                state.fileHistory.entries,
                action.page.entries,
              ),
              nextOffset: action.page.nextOffset,
              partial: action.page.partial,
              pagination: { status: "idle" },
            },
          }
        : state;
    case "fileHistory/page-failed":
      return matchesFileHistoryPageRequest(state, action)
        ? {
            ...state,
            fileHistory: {
              ...state.fileHistory,
              pagination: { status: "error", diagnostic: action.diagnostic },
            },
          }
        : state;
    case "fileCommit/loading":
      return {
        ...state,
        fileCommit: {
          status: "loading",
          requestId: action.requestId,
          rangeRevision: action.rangeRevision,
          path: action.path,
          commitId: action.commitId,
        },
      };
    case "fileCommit/loaded":
      return matchesFileCommitRequest(state, action)
        ? {
            ...state,
            fileCommit: {
              status: "ready",
              requestId: action.requestId,
              rangeRevision: action.rangeRevision,
              change: action.change,
            },
          }
        : state;
    case "fileCommit/failed":
      return matchesFileCommitRequest(state, action)
        ? {
            ...state,
            fileCommit: {
              status: "error",
              requestId: action.requestId,
              rangeRevision: action.rangeRevision,
              path: action.path,
              commitId: action.commitId,
              diagnostic: action.diagnostic,
            },
          }
        : state;
    case "appInfo/loading":
      return { ...state, appInfo: { status: "loading" } };
    case "appInfo/loaded":
      return { ...state, appInfo: { status: "ready", version: action.version } };
    case "appInfo/failed":
      return { ...state, appInfo: { status: "error", diagnostic: action.diagnostic } };
    case "fileHistory/closed":
      // The change under review belongs to the history that opened it, so both
      // close together and the review area cannot hold a change without a list.
      return state.fileHistory.status === "idle" && state.fileCommit.status === "idle"
        ? state
        : { ...state, ...clearedFileReview };
    case "fileCommit/closed":
      return { ...state, fileCommit: { status: "idle" } };
    case "baseTree/loading":
      return {
        ...state,
        baseTree: {
          status: "loading",
          requestId: action.requestId,
          rangeRevision: action.rangeRevision,
        },
      };
    case "baseTree/loaded":
      return matchesBaseTreeRequest(state, action)
        ? {
            ...state,
            baseTree: {
              status: "ready",
              rangeRevision: action.rangeRevision,
              paths: action.tree.paths,
              truncated: action.tree.truncated,
            },
          }
        : state;
    case "baseTree/failed":
      return matchesBaseTreeRequest(state, action)
        ? {
            ...state,
            baseTree: {
              status: "error",
              rangeRevision: action.rangeRevision,
              diagnostic: action.diagnostic,
            },
          }
        : state;
    case "rules/loading":
      return { ...state, groupingRules: { status: "loading", requestId: action.requestId } };
    case "rules/loaded":
      return matchesRuleRequest(state, action.requestId)
        ? {
            ...state,
            groupingRules: {
              status: "ready",
              rules: action.rules,
              saveDiagnostic: null,
            },
          }
        : state;
    case "rules/failed":
      return matchesRuleRequest(state, action.requestId)
        ? { ...state, groupingRules: { status: "error", diagnostic: action.diagnostic } }
        : state;
    case "rules/changed":
      return {
        ...state,
        groupingRules: { status: "ready", rules: action.rules, saveDiagnostic: null },
      };
    case "rules/saveFailed":
      return state.groupingRules.status === "ready"
        ? {
            ...state,
            groupingRules: { ...state.groupingRules, saveDiagnostic: action.diagnostic },
          }
        : state;
    case "symbol/looking":
      return {
        ...state,
        symbolLookup: { status: "loading", symbol: action.symbol, mode: action.mode },
      };
    case "symbol/found":
      return matchesLookup(state, action.symbol, action.mode)
        ? {
            ...state,
            symbolLookup: action.hits.length === 0
              ? { status: "empty", symbol: action.symbol, mode: action.mode }
              : {
                  status: "ready",
                  symbol: action.symbol,
                  mode: action.mode,
                  hits: action.hits,
                  truncated: action.truncated,
                },
          }
        : state;
    case "symbol/unsupported":
      return { ...state, symbolLookup: { status: "unsupported", path: action.path } };
    case "symbol/failed":
      return state.symbolLookup.status === "loading"
        && state.symbolLookup.symbol === action.symbol
        ? {
            ...state,
            symbolLookup: {
              status: "error",
              symbol: action.symbol,
              diagnostic: action.diagnostic,
            },
          }
        : state;
    case "symbol/dismissed":
      return { ...state, symbolLookup: { status: "idle" } };
    case "symbol/navigated": {
      // Only a file that is part of the result can be reviewed.
      if (!resultHoldsPath(state, action.path)) {
        return state;
      }
      const from = currentPosition(state);
      return {
        ...state,
        selectedFilePath: action.path,
        externalFile: { status: "idle" },
        reveal: { path: action.path, line: action.line, column: action.column },
        navigationHistory: from === null
          ? state.navigationHistory
          : [...state.navigationHistory, from],
        ...clearedFileReview,
      };
    }
    case "symbol/back": {
      const previous = state.navigationHistory.at(-1);
      // A position outside the result needs its contents read again, which the
      // controller does by following this with `external/opening`.
      return previous === undefined
        ? state
        : {
            ...state,
            selectedFilePath: previous.path,
            externalFile: { status: "idle" },
            reveal: previous,
            navigationHistory: state.navigationHistory.slice(0, -1),
            ...clearedFileReview,
          };
    }
    case "external/opening": {
      const from = action.remember ? currentPosition(state) : null;
      return {
        ...state,
        selectedFilePath: action.path,
        externalFile: { status: "loading", path: action.path },
        reveal: { path: action.path, line: action.line, column: action.column },
        navigationHistory: from === null
          ? state.navigationHistory
          : [...state.navigationHistory, from],
        ...clearedFileReview,
      };
    }
    case "external/opened":
      return matchesExternalRequest(state, action.path)
        ? {
            ...state,
            externalFile: { status: "ready", path: action.path, contents: action.contents },
          }
        : state;
    case "external/failed":
      return matchesExternalRequest(state, action.path)
        ? {
            ...state,
            externalFile: {
              status: "error",
              path: action.path,
              diagnostic: action.diagnostic,
            },
          }
        : state;
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
            // The path list belongs to a comparison base, so a new range drops it.
            baseTree: { status: "idle" },
            ...clearedFileReview,
            ...clearedSymbolNavigation,
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
              firstPageOffset: action.result.page.nextOffset,
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
    case "range/loadedPagesReset":
      return resetLoadedPages(state);
    case "commit/selectionCleared":
      return clearSelection(state);
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
            ...clearedFileReview,
            ...clearedSymbolNavigation,
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
            ...clearedFileReview,
            ...clearedSymbolNavigation,
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
            ...clearedFileReview,
            ...clearedSymbolNavigation,
          }
        : state;
    case "composition/cancelled":
      return matchesCompositionRequest(state, action)
        ? {
            ...state,
            composition: { status: "cancelled", requestId: action.requestId },
            selectedFilePath: null,
            ...clearedFileReview,
            ...clearedSymbolNavigation,
          }
        : state;
    case "file/selected":
      // Picking a file by hand starts a fresh review position, so the symbol
      // panel and the way back to the previous position no longer apply.
      return resultHoldsPath(state, action.path)
        ? {
            ...state,
            selectedFilePath: action.path,
            ...clearedFileReview,
            ...clearedSymbolNavigation,
          }
        : state;
  }
}

function matchesFileHistoryRequest(
  state: AppState,
  action: { readonly requestId: string; readonly rangeRevision: string },
): state is AppState & { fileHistory: Extract<FileHistoryState, { status: "loading" }> } {
  return state.fileHistory.status === "loading" &&
    state.fileHistory.requestId === action.requestId &&
    state.fileHistory.rangeRevision === action.rangeRevision &&
    state.range.status === "ready" &&
    state.range.range.rangeRevision === action.rangeRevision;
}

function matchesFileHistoryPageRequest(
  state: AppState,
  action: {
    readonly requestId: string;
    readonly rangeRevision: string;
    readonly path: string;
  },
): state is AppState & { fileHistory: Extract<FileHistoryState, { status: "ready" }> } {
  return state.fileHistory.status === "ready" &&
    state.fileHistory.path === action.path &&
    state.fileHistory.rangeRevision === action.rangeRevision &&
    state.fileHistory.pagination.status === "loading" &&
    state.fileHistory.pagination.requestId === action.requestId;
}

function matchesFileCommitRequest(
  state: AppState,
  action: { readonly requestId: string; readonly rangeRevision: string },
): state is AppState & { fileCommit: Extract<FileCommitState, { status: "loading" }> } {
  return state.fileCommit.status === "loading" &&
    state.fileCommit.requestId === action.requestId &&
    state.fileCommit.rangeRevision === action.rangeRevision &&
    state.range.status === "ready" &&
    state.range.range.rangeRevision === action.rangeRevision;
}

function appendUniqueFileHistory(
  current: readonly FileHistoryEntryDto[],
  additional: readonly FileHistoryEntryDto[],
): readonly FileHistoryEntryDto[] {
  const known = new Set(current.map((entry) => entry.id));
  return [...current, ...additional.filter((entry) => !known.has(entry.id))];
}

/**
 * A reply is applied only while its own read is still the one running and the
 * range it answered is still the range under review.
 */
function matchesBaseTreeRequest(
  state: AppState,
  action: { readonly requestId: string; readonly rangeRevision: string },
): boolean {
  return state.baseTree.status === "loading"
    && state.baseTree.requestId === action.requestId
    && state.range.status === "ready"
    && state.range.range.rangeRevision === action.rangeRevision;
}

/** A reply is applied only while its own read is still the one running. */
function matchesRuleRequest(state: AppState, requestId: string): boolean {
  return state.groupingRules.status === "loading"
    && state.groupingRules.requestId === requestId;
}

/**
 * Drops the pages the user added and keeps the first one. Nothing is read again:
 * pages are appended in order, so the first page is the front of the list.
 * Selection is untouched, because shortening the list is not the same as taking
 * a commit out of the result.
 */
function resetLoadedPages(state: AppState): AppState {
  if (state.range.status !== "ready" || state.range.firstPageOffset === null) {
    return state;
  }
  const { firstPageOffset } = state.range;
  if (state.range.commits.length <= firstPageOffset) {
    return state;
  }
  return {
    ...state,
    range: {
      ...state.range,
      commits: state.range.commits.slice(0, firstPageOffset),
      nextOffset: firstPageOffset,
      pagination: { status: "idle" },
    },
  };
}

/**
 * Empties the selection. A calculated result is put down with it: a result whose
 * commits are no longer selected would describe something the screen no longer
 * says is selected.
 */
function clearSelection(state: AppState): AppState {
  if (state.selectedCommitIds.length === 0) {
    return state;
  }
  return {
    ...state,
    selectedCommitIds: [],
    mergeParents: {},
    composition: { status: "idle" },
    selectedFilePath: null,
    ...clearedFileReview,
    ...clearedSymbolNavigation,
  };
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
    // Rules belong to one repository, so the next one starts from its own file.
    groupingRules: { status: "idle" },
    baseTree: { status: "idle" },
    ...clearedFileReview,
    ...clearedSymbolNavigation,
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
    ...clearedFileReview,
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
  if (mainlineParent < 1 || mainlineParent > commit.parents.length) {
    return state;
  }
  return {
    ...state,
    mergeParents: { ...state.mergeParents, [commitId]: mainlineParent },
    composition: { status: "idle" },
    selectedFilePath: null,
    ...clearedFileReview,
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
/**
 * A reply is applied only while its own lookup is still the one running, so a
 * slow answer cannot replace the answer to a later question.
 */
function matchesLookup(state: AppState, symbol: string, mode: SymbolLookupMode): boolean {
  return state.symbolLookup.status === "loading"
    && state.symbolLookup.symbol === symbol
    && state.symbolLookup.mode === mode;
}

/** A reply is applied only while that file is still the one being opened. */
function matchesExternalRequest(state: AppState, path: string): boolean {
  return state.externalFile.status === "loading" && state.externalFile.path === path;
}

/** Where the review is now, so a navigation can offer a way back. */
function currentPosition(state: AppState): ReviewPosition | null {
  if (state.selectedFilePath === null) {
    return null;
  }
  const path = state.selectedFilePath;
  return state.reveal?.path === path
    ? state.reveal
    : { path, line: 1, column: 1 };
}

/**
 * Whether the result under review holds that path, as a changed file or as a
 * problem file. Only such a path can be reviewed; anything else has to be read
 * from the comparison base. Exported so the controller decides with the same
 * rule the reducer enforces.
 */
export function resultHoldsPath(state: AppState, path: string): boolean {
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
    ...clearedFileReview,
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
