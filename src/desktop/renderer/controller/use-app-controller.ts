import { useReducer } from "react";

import type {
  DesktopApi,
  Diagnostic,
} from "../../shared/index.js";
import { selectRepositorySession } from "../state/app-selectors.js";
import {
  appReducer,
  initialAppState,
  type AppState,
} from "../state/app-state.js";

export interface AppController {
  readonly state: AppState;
  readonly openRepository: () => Promise<void>;
  readonly loadRange: (baseRef: string, headRef: string) => Promise<void>;
  readonly loadMoreCommits: () => Promise<void>;
  readonly toggleCommit: (commitId: string) => void;
  readonly inspectCommit: (commitId: string) => void;
  readonly composeSelection: () => Promise<void>;
  readonly cancelComposition: () => Promise<void>;
  readonly selectFile: (path: string) => void;
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

  const openRepository = async (): Promise<void> => {
    const requestId = createRequestId();
    dispatch({ type: "repository/selecting", requestId });
    try {
      const result = await api.selectRepository();
      switch (result.status) {
        case "success":
          cancelActiveForStateChange();
          dispatch({ type: "repository/loaded", requestId, session: result.data });
          break;
        case "cancelled":
          dispatch({ type: "repository/cancelled", requestId });
          break;
        case "error":
          dispatch({ type: "repository/failed", requestId, diagnostic: result.diagnostic });
          break;
      }
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
    inspectCommit: (commitId) => {
      dispatch({ type: "commit/inspected", commitId });
    },
    composeSelection,
    cancelComposition,
    selectFile: (path) => {
      dispatch({ type: "file/selected", path });
    },
  };
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
