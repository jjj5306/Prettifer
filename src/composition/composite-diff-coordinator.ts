import {
  type CompositeDiffRequest,
  type CompositeDiffResult,
} from "./composite-diff-service.js";
import {
  SelectionError,
  type SelectionErrorCode,
} from "./selection-planner.js";
import {
  GitCommandAbortedError,
  GitCommandError,
} from "../git/git-command-runner.js";

export type { CompositeDiffResult } from "./composite-diff-service.js";

export interface CompositeDiffCalculator {
  compose(request: CompositeDiffRequest): Promise<CompositeDiffResult>;
}

export type CompositionDiagnosticCode =
  | SelectionErrorCode
  | "REPOSITORY_LOCKED"
  | "REPOSITORY_PERMISSION_DENIED"
  | "INSUFFICIENT_STORAGE"
  | "COMPOSITION_FAILED";

export interface CompositionDiagnostic {
  code: CompositionDiagnosticCode;
  message: string;
  commit?: string;
  nextAction: string;
}

export type CompositeDiffState =
  | { status: "idle"; message: string }
  | { status: "calculating"; selectedCommits: readonly string[] }
  | {
      status: "ready";
      selectedCommits: readonly string[];
      result: CompositeDiffResult;
    }
  | {
      status: "error";
      selectedCommits: readonly string[];
      diagnostic: CompositionDiagnostic;
    };

export class CompositeDiffCoordinator {
  private generation = 0;
  private activeController: AbortController | undefined;
  private state: CompositeDiffState = {
    status: "idle",
    message: "Select at least one commit to build a result.",
  };

  constructor(private readonly calculator: CompositeDiffCalculator) {}

  get current(): CompositeDiffState {
    return this.state;
  }

  async update(
    request: Omit<CompositeDiffRequest, "signal">,
  ): Promise<CompositeDiffState> {
    const generation = this.generation + 1;
    this.generation = generation;
    this.activeController?.abort();

    if (request.selectedCommits.length === 0) {
      this.activeController = undefined;
      this.state = {
        status: "idle",
        message: "Select at least one commit to build a result.",
      };
      return this.state;
    }

    const controller = new AbortController();
    this.activeController = controller;
    this.state = {
      status: "calculating",
      selectedCommits: [...request.selectedCommits],
    };

    try {
      const result = await this.calculator.compose({
        ...request,
        signal: controller.signal,
      });
      if (generation !== this.generation) {
        return this.state;
      }
      this.activeController = undefined;
      this.state = {
        status: "ready",
        selectedCommits: [...request.selectedCommits],
        result,
      };
    } catch (error) {
      if (generation !== this.generation) {
        return this.state;
      }
      this.activeController = undefined;
      if (error instanceof GitCommandAbortedError) {
        this.state = { status: "idle", message: "The calculation was cancelled." };
        return this.state;
      }
      this.state = {
        status: "error",
        selectedCommits: [...request.selectedCommits],
        diagnostic: createDiagnostic(error),
      };
    }
    return this.state;
  }

  cancel(): void {
    this.generation += 1;
    this.activeController?.abort();
    this.activeController = undefined;
    this.state = { status: "idle", message: "The calculation was cancelled." };
  }
}

function createDiagnostic(error: unknown): CompositionDiagnostic {
  if (error instanceof SelectionError) {
    return {
      code: error.code,
      message: error.message,
      commit: error.commit,
      nextAction: error.nextAction,
    };
  }
  if (error instanceof GitCommandError) {
    if (storageFailurePattern.test(error.stderr)) {
      return {
        code: "INSUFFICIENT_STORAGE",
        message:
          "The selected result could not be built because available storage is insufficient.",
        nextAction:
          "Free storage space on the repository or system drive, then try again.",
      };
    }
    if (permissionFailurePattern.test(error.stderr)) {
      return {
        code: "REPOSITORY_PERMISSION_DENIED",
        message: "The selected result could not access the repository workspace.",
        nextAction:
          "Check repository and temporary-folder permissions, then try again.",
      };
    }
    if (lockFailurePattern.test(error.stderr)) {
      return {
        code: "REPOSITORY_LOCKED",
        message: "The repository is busy with another Git operation.",
        nextAction: "Wait for other Git operations to finish, then try again.",
      };
    }
  }
  return {
    code: "COMPOSITION_FAILED",
    message: "The selected result could not be calculated.",
    nextAction: "Check the repository and selected commits, then try again.",
  };
}

const storageFailurePattern =
  /\bENOSPC\b|no space left on device|not enough space (?:on|available)|there is not enough space|disk (?:is )?full|quota exceeded|insufficient (?:disk )?space/iu;
const permissionFailurePattern =
  /\bEACCES\b|\bEPERM\b|permission denied|access is denied|operation not permitted|read-only file system/iu;
const lockFailurePattern =
  /could not lock|cannot lock|unable to (?:create|lock)[^\r\n]*\.lock|another git process|\.lock['"]?:?\s*file exists/iu;
