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
          message: "취소할 계산 요청이 현재 요청과 일치하지 않습니다.",
          subject: request.requestId,
          nextAction: "현재 화면 상태를 확인한 뒤 필요한 계산을 다시 시작해 주세요.",
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
    message: "통합 결과 계산이 완료되지 않았습니다.",
    nextAction: "잠시 후 다시 계산해 주세요.",
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
    message: "통합 결과를 계산할 수 없습니다.",
    nextAction: "저장소 상태와 선택 커밋을 확인한 뒤 다시 계산해 주세요.",
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
    diagnostic.code === "AMBIGUOUS_SELECTION"
  ) {
    return {
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.commit === undefined ? {} : { subject: diagnostic.commit }),
      nextAction: diagnostic.nextAction,
    };
  }
  return {
    code: "COMPOSITION_FAILED",
    message: "통합 결과를 계산할 수 없습니다.",
    nextAction: "저장소 상태와 선택 커밋을 확인한 뒤 다시 계산해 주세요.",
  };
}
