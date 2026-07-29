import type {
  ApiResult,
  CancelCompositionRequest,
  CompositeDiffResultDto,
  CompositionRequest,
  Diagnostic,
} from "../shared/index.js";
import type {
  CompositeDiffState,
} from "../../composition/composite-diff-coordinator.js";
import type { CompositeDiffRequest } from "../../composition/composite-diff-service.js";
import {
  RepositoryHistoryError,
  type RepositoryHistoryService,
} from "../../history/repository-history-service.js";

interface RangeValidator {
  assertCompositionInput(
    request: Parameters<RepositoryHistoryService["assertCompositionInput"]>[0],
  ): Promise<void>;
}

interface CompositionCoordinator {
  update(request: Omit<CompositeDiffRequest, "signal">): Promise<CompositeDiffState>;
  cancel(): void;
}

export class DesktopCompositionController {
  private activeRequest: string | undefined;

  constructor(
    private readonly history: RangeValidator,
    private readonly coordinator: CompositionCoordinator,
    private readonly beforeCompose: () => Promise<void> = () => Promise.resolve(),
    private readonly signal?: AbortSignal,
  ) {}

  async compose(
    request: CompositionRequest,
    repositoryPath: string,
  ): Promise<ApiResult<CompositeDiffResultDto>> {
    const requestIdentity = createRequestIdentity(request);
    this.activeRequest = requestIdentity;
    try {
      await this.beforeCompose();
      if (this.activeRequest !== requestIdentity) {
        return { status: "cancelled" };
      }
      await this.history.assertCompositionInput({
        repositoryPath,
        range: {
          baseRef: request.range.baseRef,
          baseRefCommit: request.range.baseRefCommit,
          headRef: request.range.headRef,
          headCommit: request.range.headCommit,
          baseCommit: request.range.baseCommit,
          revision: request.range.rangeRevision,
        },
        selectedCommits: request.selectedCommits,
        ...(this.signal === undefined ? {} : { signal: this.signal }),
      });
      if (this.activeRequest !== requestIdentity) {
        return { status: "cancelled" };
      }
      const state = await this.coordinator.update({
        repositoryPath,
        baseRef: request.range.baseCommit,
        headRef: request.range.headCommit,
        selectedCommits: request.selectedCommits,
        mainlineParents: request.mainlineParents,
      });
      if (this.activeRequest !== requestIdentity) {
        return { status: "cancelled" };
      }
      this.activeRequest = undefined;
      switch (state.status) {
        case "ready":
          return {
            status: "success",
            data: {
              ...state.result,
              selectedCommits: [...state.result.selectedCommits],
              files: state.result.files.map((file) => ({ ...file })),
              problemFiles: state.result.problemFiles.map((file) => ({ ...file })),
            },
          };
        case "error":
          return { status: "error", diagnostic: publicCompositionDiagnostic(state.diagnostic) };
        case "calculating":
          return { status: "error", diagnostic: calculationDiagnostic() };
        case "idle":
          return { status: "cancelled" };
      }
    } catch (error) {
      if (this.activeRequest === requestIdentity) {
        this.activeRequest = undefined;
      }
      return { status: "error", diagnostic: toCompositionDiagnostic(error) };
    }
  }

  cancel(
    request: CancelCompositionRequest,
  ): ApiResult<null> {
    const prefix = `${request.repositorySessionId}:${request.sessionRevision}:${request.requestId}:`;
    if (this.activeRequest?.startsWith(prefix) !== true) {
      return {
        status: "error",
        diagnostic: {
          code: "REQUEST_EXPIRED",
          message: "The calculation to cancel is no longer active.",
          subject: request.requestId,
          nextAction: "Review the current selection, then start a new calculation.",
        },
      };
    }
    this.activeRequest = undefined;
    this.coordinator.cancel();
    return { status: "success", data: null };
  }

  dispose(): void {
    this.activeRequest = undefined;
    this.coordinator.cancel();
  }
}

function createRequestIdentity(request: CompositionRequest): string {
  return [
    request.repositorySessionId,
    request.sessionRevision,
    request.requestId,
    request.range.rangeRevision,
  ].join(":");
}

function calculationDiagnostic(): Diagnostic {
  return {
    code: "COMPOSITION_INCOMPLETE",
    message: "The selected result calculation did not complete.",
    nextAction: "Try the calculation again.",
  };
}

function toCompositionDiagnostic(error: unknown): Diagnostic {
  if (error instanceof RepositoryHistoryError) {
    return {
      code: error.code,
      message: error.message,
      subject: error.subject,
      nextAction: error.nextAction,
    };
  }
  return {
    code: "COMPOSITION_FAILED",
    message: "The selected result could not be calculated.",
    nextAction: "Check the repository and selected commits, then try again.",
  };
}

function publicCompositionDiagnostic(diagnostic: {
  readonly code: string;
  readonly message: string;
  readonly commit?: string;
  readonly nextAction: string;
}): Diagnostic {
  if (
    diagnostic.code === "INVALID_COMMIT" ||
    diagnostic.code === "COMMIT_OUTSIDE_COMPARISON" ||
    diagnostic.code === "AMBIGUOUS_SELECTION" ||
    diagnostic.code === "COMMIT_APPLY_CONFLICT" ||
    diagnostic.code === "MAINLINE_PARENT_REQUIRED" ||
    diagnostic.code === "MAINLINE_PARENT_OUT_OF_RANGE"
  ) {
    return {
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.commit === undefined ? {} : { subject: diagnostic.commit }),
      nextAction: diagnostic.nextAction,
    };
  }
  if (
    diagnostic.code === "REPOSITORY_LOCKED" ||
    diagnostic.code === "REPOSITORY_PERMISSION_DENIED" ||
    diagnostic.code === "INSUFFICIENT_STORAGE"
  ) {
    return {
      code: diagnostic.code,
      message: diagnostic.message,
      nextAction: diagnostic.nextAction,
    };
  }
  return {
    code: "COMPOSITION_FAILED",
    message: "The selected result could not be calculated.",
    nextAction: "Check the repository and selected commits, then try again.",
  };
}
