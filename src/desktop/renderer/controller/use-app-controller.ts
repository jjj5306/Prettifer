import { useEffect, useReducer, useRef } from "react";

import type {
  ApiResult,
  DesktopApi,
  Diagnostic,
  GroupRuleDto,
  RepositorySession,
  SymbolHitDto,
} from "../../shared/index.js";
import { symbolLanguageForPath } from "../../../symbols/language-support.js";
import { preferredDeclarations, type SymbolUsage } from "../../../symbols/definition-choice.js";
import { findOccurrences } from "../../../symbols/occurrences.js";
import { selectRepositorySession } from "../state/app-selectors.js";
import { mergeSymbolHits } from "../symbols/merge-hits.js";
import {
  appReducer,
  initialAppState,
  resultHoldsPath,
  type AppAction,
  type AppState,
  type ReviewPosition,
  type SymbolLookupMode,
} from "../state/app-state.js";

export interface AppController {
  readonly state: AppState;
  readonly openRepository: () => Promise<void>;
  readonly loadRange: (baseRef: string, headRef: string) => Promise<void>;
  readonly loadMoreCommits: () => Promise<void>;
  readonly toggleCommit: (commitId: string) => void;
  /** Drops the pages the user added and keeps the first one. Reads nothing. */
  readonly resetLoadedCommits: () => void;
  /** Empties the commit selection and the result built from it. */
  readonly clearCommitSelection: () => void;
  readonly inspectCommit: (commitId: string) => void;
  readonly composeSelection: () => Promise<void>;
  readonly chooseMainlineParent: (commitId: string, mainlineParent: number) => void;
  readonly cancelComposition: () => Promise<void>;
  readonly selectFile: (path: string) => void;
  /** Finds where a symbol is declared and used, for the file under review. */
  readonly lookUpSymbol: (
    symbol: string,
    mode: SymbolLookupMode,
    usage: SymbolUsage,
  ) => Promise<void>;
  readonly goToHit: (hit: SymbolHitDto, symbol: string) => void;
  readonly dismissSymbolLookup: () => void;
  readonly goBack: () => void;
  /**
   * Reads the comparison base path list, once per range. Called when the review
   * first needs the whole repository structure.
   */
  readonly loadBaseTree: () => Promise<void>;
  /** Replaces the grouping rules of the open repository and saves them. */
  readonly saveGroupingRules: (rules: readonly GroupRuleDto[]) => Promise<void>;
}

export function useAppController(
  api: DesktopApi,
  createRequestId: () => string = defaultRequestId,
): AppController {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  const cancelActiveForStateChange = (): void => {
    const session = selectRepositorySession(state.repository);
    if (session === null || state.composition.status !== "loading") {
      return;
    }
    const active = state.composition;
    void api.cancelComposition({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      requestId: active.requestId,
    }).catch((error: unknown) => {
      dispatch({
        type: "composition/failed",
        requestId: active.requestId,
        sessionRevision: active.sessionRevision,
        rangeRevision: active.rangeRevision,
        diagnostic: connectionDiagnostic(error),
      });
    });
  };

  /*
   * Opens the repository the app was started with. It reuses the state
   * transitions of a folder selection, and a run without a path argument reports
   * a cancellation, which leaves the screen as it starts. Nothing can be running
   * before the first effect, so there is no active calculation to cancel.
   */
  const startupOpened = useRef(false);
  useEffect(() => {
    if (startupOpened.current) {
      return undefined;
    }
    startupOpened.current = true;
    let applies = true;
    const requestId = createRequestId();
    dispatch({ type: "repository/selecting", requestId });
    api.openInitialRepository().then((result) => {
      if (applies) {
        dispatch(repositoryResultAction(requestId, result));
      }
    }).catch((error: unknown) => {
      if (applies) {
        dispatch({
          type: "repository/failed",
          requestId,
          diagnostic: connectionDiagnostic(error),
        });
      }
    });
    return () => { applies = false; };
    // The startup repository is opened once for the lifetime of the app, so this
    // deliberately ignores later `api` and `createRequestId` identities. Reacting
    // to them would reopen the repository on every render (issue #53).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Grouping rules live in the application settings, outside the repository
   * under review, so they are read once per repository session and kept in
   * state from then on. Switching repositories resets them, which is what makes
   * this run again for the next one.
   */
  const openSession = selectRepositorySession(state.repository);
  const openSessionId = openSession?.repositorySessionId ?? null;
  const openSessionRevision = openSession?.sessionRevision ?? null;
  useEffect(() => {
    if (openSessionId === null || openSessionRevision === null) {
      return undefined;
    }
    let applies = true;
    const requestId = createRequestId();
    dispatch({ type: "rules/loading", requestId });
    api.readGroupingRules({
      repositorySessionId: openSessionId,
      sessionRevision: openSessionRevision,
    }).then((result) => {
      if (!applies) {
        return;
      }
      if (result.status === "success") {
        dispatch({ type: "rules/loaded", requestId, rules: result.data.rules });
      } else if (result.status === "error") {
        dispatch({ type: "rules/failed", requestId, diagnostic: result.diagnostic });
      }
    }).catch((error: unknown) => {
      if (applies) {
        dispatch({ type: "rules/failed", requestId, diagnostic: connectionDiagnostic(error) });
      }
    });
    return () => { applies = false; };
    // Reading is tied to the repository session, not to the identity `api` and
    // `createRequestId` happen to have on a render. Reacting to those would read
    // the settings again on every render, the same trap as issue #53. The rule
    // state is deliberately absent too: it changes as a result of this read, and
    // depending on it would cancel the read that set it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSessionId, openSessionRevision]);

  /*
   * The edit is put on screen before the settings file answers, and stays there
   * when the answer is a failure, so a settings folder that cannot be written
   * never costs the user the rule they just wrote.
   */
  const saveGroupingRules = async (rules: readonly GroupRuleDto[]): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    if (session === null) {
      return;
    }
    dispatch({ type: "rules/changed", rules });
    try {
      const result = await api.saveGroupingRules({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        rules: rules.map((rule) => ({ ...rule })),
      });
      if (result.status === "error") {
        dispatch({ type: "rules/saveFailed", diagnostic: result.diagnostic });
      }
    } catch (error) {
      dispatch({ type: "rules/saveFailed", diagnostic: connectionDiagnostic(error) });
    }
  };

  /*
   * The path list belongs to the comparison base, not to a calculation, so it is
   * read at most once per range. Asking again while an answer for the same range
   * exists or is on its way does nothing.
   */
  const loadBaseTree = async (): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    if (session === null || state.range.status !== "ready") {
      return;
    }
    const { range } = state.range;
    if (
      state.baseTree.status !== "idle"
      && state.baseTree.rangeRevision === range.rangeRevision
    ) {
      return;
    }
    const requestId = createRequestId();
    dispatch({
      type: "baseTree/loading",
      requestId,
      rangeRevision: range.rangeRevision,
    });
    try {
      const result = await api.listBaseTree({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        range,
      });
      if (result.status === "success") {
        dispatch({
          type: "baseTree/loaded",
          requestId,
          rangeRevision: range.rangeRevision,
          tree: result.data,
        });
      } else if (result.status === "error") {
        dispatch({
          type: "baseTree/failed",
          requestId,
          rangeRevision: range.rangeRevision,
          diagnostic: result.diagnostic,
        });
      }
    } catch (error) {
      dispatch({
        type: "baseTree/failed",
        requestId,
        rangeRevision: range.rangeRevision,
        diagnostic: connectionDiagnostic(error),
      });
    }
  };

  const openRepository = async (): Promise<void> => {
    const requestId = createRequestId();
    dispatch({ type: "repository/selecting", requestId });
    try {
      const result = await api.selectRepository();
      if (result.status === "success") {
        cancelActiveForStateChange();
      }
      dispatch(repositoryResultAction(requestId, result));
    } catch (error) {
      dispatch({
        type: "repository/failed",
        requestId,
        diagnostic: connectionDiagnostic(error),
      });
    }
  };

  const loadRange = async (baseRef: string, headRef: string): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    if (session === null) {
      return;
    }
    const requestId = createRequestId();
    cancelActiveForStateChange();
    dispatch({
      type: "range/loading",
      requestId,
      sessionRevision: session.sessionRevision,
      baseRef,
      headRef,
    });
    try {
      const result = await api.loadRange({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        baseRef,
        headRef,
      });
      if (result.status === "success") {
        dispatch({
          type: "range/loaded",
          requestId,
          sessionRevision: session.sessionRevision,
          result: result.data,
        });
      } else if (result.status === "error") {
        dispatch({
          type: "range/failed",
          requestId,
          sessionRevision: session.sessionRevision,
          diagnostic: result.diagnostic,
        });
      }
    } catch (error) {
      dispatch({
        type: "range/failed",
        requestId,
        sessionRevision: session.sessionRevision,
        diagnostic: connectionDiagnostic(error),
      });
    }
  };

  const loadMoreCommits = async (): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    if (session === null || state.range.status !== "ready" || state.range.nextOffset === null) {
      return;
    }
    const requestId = createRequestId();
    const { range, nextOffset } = state.range;
    dispatch({
      type: "range/page-loading",
      requestId,
      sessionRevision: session.sessionRevision,
      rangeRevision: range.rangeRevision,
    });
    try {
      const result = await api.listCommits({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        range,
        offset: nextOffset,
      });
      if (result.status === "success") {
        dispatch({
          type: "range/page-loaded",
          requestId,
          sessionRevision: session.sessionRevision,
          rangeRevision: range.rangeRevision,
          commits: result.data.commits,
          nextOffset: result.data.nextOffset,
        });
      } else if (result.status === "error") {
        dispatch({
          type: "range/page-failed",
          requestId,
          sessionRevision: session.sessionRevision,
          rangeRevision: range.rangeRevision,
          diagnostic: result.diagnostic,
        });
      }
    } catch (error) {
      dispatch({
        type: "range/page-failed",
        requestId,
        sessionRevision: session.sessionRevision,
        rangeRevision: range.rangeRevision,
        diagnostic: connectionDiagnostic(error),
      });
    }
  };

  const composeSelection = async (): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    if (
      session === null ||
      state.range.status !== "ready" ||
      state.selectedCommitIds.length === 0
    ) {
      return;
    }
    const requestId = createRequestId();
    const rangeRevision = state.range.range.rangeRevision;
    dispatch({
      type: "composition/loading",
      requestId,
      sessionRevision: session.sessionRevision,
      rangeRevision,
    });
    try {
      const result = await api.composeSelection({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        range: state.range.range,
        requestId,
        selectedCommits: [...state.selectedCommitIds],
        mainlineParents: selectedMainlineParents(state),
      });
      if (result.status === "success") {
        dispatch({
          type: "composition/loaded",
          requestId,
          sessionRevision: session.sessionRevision,
          rangeRevision,
          result: result.data,
        });
      } else if (result.status === "error") {
        dispatch({
          type: "composition/failed",
          requestId,
          sessionRevision: session.sessionRevision,
          rangeRevision,
          diagnostic: result.diagnostic,
        });
      } else {
        dispatch({
          type: "composition/cancelled",
          requestId,
          sessionRevision: session.sessionRevision,
          rangeRevision,
        });
      }
    } catch (error) {
      dispatch({
        type: "composition/failed",
        requestId,
        sessionRevision: session.sessionRevision,
        rangeRevision,
        diagnostic: connectionDiagnostic(error),
      });
    }
  };

  /*
   * Searches the comparison base in the main process, then replaces the hits of
   * every file the selection changed with hits from the composed contents. That
   * way the list describes the result under review, not the base, and the
   * composed contents never cross the process boundary a second time.
   */
  const lookUpSymbol = async (
    symbol: string,
    mode: SymbolLookupMode,
    usage: SymbolUsage,
  ): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    const path = state.selectedFilePath;
    if (
      session === null ||
      path === null ||
      state.range.status !== "ready" ||
      state.composition.status !== "ready"
    ) {
      return;
    }
    if (symbolLanguageForPath(path) === null) {
      dispatch({ type: "symbol/unsupported", path });
      return;
    }
    const { result } = state.composition;
    dispatch({ type: "symbol/looking", symbol, mode });
    try {
      const found = await api.searchSymbol({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        range: state.range.range,
        symbol,
      });
      if (found.status === "success") {
        const merged = mergeSymbolHits(found.data.hits, result, symbol);
        /*
         * A definition lookup keeps only the kind that answers where the user
         * pointed, so a class is not buried under its constructors and a method
         * is not buried under local variables of the same name. A reference list
         * keeps everything: showing all of it is the point.
         */
        const hits = mode === "definition"
          ? preferredDeclarations(merged, usage)
          : merged;
        const only = hits.length === 1 ? hits[0] : undefined;
        if (mode === "definition" && only !== undefined) {
          // One declaration is not a choice, so go there instead of listing it.
          dispatch({ type: "symbol/dismissed" });
          goToHit(only, symbol);
        } else {
          dispatch({
            type: "symbol/found",
            symbol,
            mode,
            hits,
            truncated: found.data.truncated,
          });
        }
      } else if (found.status === "error") {
        dispatch({ type: "symbol/failed", symbol, diagnostic: found.diagnostic });
      } else {
        dispatch({ type: "symbol/dismissed" });
      }
    } catch (error) {
      dispatch({ type: "symbol/failed", symbol, diagnostic: connectionDiagnostic(error) });
    }
  };

  /*
   * Opens a file the selection never changed. The symbol search covers the whole
   * repository, so most declarations live outside the result; such a file is read
   * at the comparison base, the same revision the review compares against.
   */
  const openBaseFile = async (
    position: ReviewPosition,
    remember: boolean,
  ): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    const { path, line, column } = position;
    if (session === null || state.range.status !== "ready") {
      return;
    }
    dispatch({ type: "external/opening", path, line, column, remember });
    try {
      const result = await api.readBaseFile({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        range: state.range.range,
        path,
      });
      if (result.status === "success") {
        dispatch({ type: "external/opened", path, contents: result.data.contents });
      } else if (result.status === "error") {
        dispatch({ type: "external/failed", path, diagnostic: result.diagnostic });
      }
    } catch (error) {
      dispatch({ type: "external/failed", path, diagnostic: connectionDiagnostic(error) });
    }
  };

  /*
   * A hit carries its own line, so the column of the symbol on that line is read
   * here rather than asked of the main process. Landing on the symbol is what
   * makes a jump to a member declaration point at the member.
   */
  const goToHit = (hit: SymbolHitDto, symbol: string): void => {
    const position = {
      path: hit.path,
      line: hit.line,
      column: symbolColumn(hit.text, symbol),
    };
    if (resultHoldsPath(state, hit.path)) {
      dispatch({ type: "symbol/navigated", ...position });
      return;
    }
    void openBaseFile(position, true);
  };

  const goBack = (): void => {
    const previous = state.navigationHistory.at(-1);
    if (previous === undefined) {
      return;
    }
    dispatch({ type: "symbol/back" });
    if (!resultHoldsPath(state, previous.path)) {
      // The position was just popped, so it must not be pushed again.
      void openBaseFile(previous, false);
    }
  };

  const cancelComposition = async (): Promise<void> => {
    const session = selectRepositorySession(state.repository);
    if (session === null || state.composition.status !== "loading") {
      return;
    }
    const active = state.composition;
    try {
      const result = await api.cancelComposition({
        repositorySessionId: session.repositorySessionId,
        sessionRevision: session.sessionRevision,
        requestId: active.requestId,
      });
      if (result.status === "error") {
        dispatch({
          type: "composition/failed",
          requestId: active.requestId,
          sessionRevision: active.sessionRevision,
          rangeRevision: active.rangeRevision,
          diagnostic: result.diagnostic,
        });
      } else {
        dispatch({
          type: "composition/cancelled",
          requestId: active.requestId,
          sessionRevision: active.sessionRevision,
          rangeRevision: active.rangeRevision,
        });
      }
    } catch (error) {
      dispatch({
        type: "composition/failed",
        requestId: active.requestId,
        sessionRevision: active.sessionRevision,
        rangeRevision: active.rangeRevision,
        diagnostic: connectionDiagnostic(error),
      });
    }
  };

  return {
    state,
    openRepository,
    loadRange,
    loadMoreCommits,
    toggleCommit: (commitId) => {
      cancelActiveForStateChange();
      dispatch({ type: "commit/toggled", commitId });
    },
    resetLoadedCommits: () => {
      dispatch({ type: "range/loadedPagesReset" });
    },
    clearCommitSelection: () => {
      cancelActiveForStateChange();
      dispatch({ type: "commit/selectionCleared" });
    },
    inspectCommit: (commitId) => {
      dispatch({ type: "commit/inspected", commitId });
    },
    chooseMainlineParent: (commitId, mainlineParent) => {
      dispatch({ type: "commit/mainlineParentChosen", commitId, mainlineParent });
    },
    composeSelection,
    cancelComposition,
    /*
     * Full Tree also offers files the selection never changed. Those are not in
     * the result, so they take the same path a symbol navigation outside the
     * result takes: read at the comparison base and shown as one document.
     */
    selectFile: (path) => {
      if (resultHoldsPath(state, path)) {
        dispatch({ type: "file/selected", path });
        return;
      }
      void openBaseFile({ path, line: 1, column: 1 }, false);
    },
    lookUpSymbol,
    goToHit,
    dismissSymbolLookup: () => {
      dispatch({ type: "symbol/dismissed" });
    },
    goBack,
    loadBaseTree,
    saveGroupingRules,
  };
}

/**
 * The column of the symbol on the line a hit reports.
 *
 * Whole-word matching matters here: on `subtotal = total;` a plain search for
 * `total` would point the cursor at `subtotal`. A line that holds the name only
 * inside a comment or a string falls back to the start of the line.
 */
function symbolColumn(line: string, symbol: string): number {
  return findOccurrences(line, symbol)[0]?.column ?? 1;
}

function connectionDiagnostic(_error: unknown): Diagnostic {
  void _error;
  return {
    code: "DESKTOP_CONNECTION_FAILED",
    message: "Desktop features are unavailable.",
    nextAction: "Reopen the app window and try again.",
  };
}

function defaultRequestId(): string {
  return globalThis.crypto.randomUUID();
}

/** Keeps only the mainline parents of commits that are currently selected. */
function selectedMainlineParents(state: AppState): Record<string, number> {
  const selected = new Set(state.selectedCommitIds);
  return Object.fromEntries(
    Object.entries(state.mergeParents).filter(([commitId]) => selected.has(commitId)),
  );
}

/** One mapping from a repository result to a state transition. */
function repositoryResultAction(
  requestId: string,
  result: ApiResult<RepositorySession>,
): AppAction {
  switch (result.status) {
    case "success":
      return { type: "repository/loaded", requestId, session: result.data };
    case "cancelled":
      return { type: "repository/cancelled", requestId };
    case "error":
      return { type: "repository/failed", requestId, diagnostic: result.diagnostic };
  }
}
