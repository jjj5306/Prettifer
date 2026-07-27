import {
  type CompositeDiffRequest,
  type CompositeDiffResult,
} from "./composite-diff-service.js";
import { SelectionError } from "./selection-planner.js";
import { GitCommandAbortedError } from "../git/git-command-runner.js";

export type { CompositeDiffResult } from "./composite-diff-service.js";

export interface CompositeDiffCalculator {
  compose(request: CompositeDiffRequest): Promise<CompositeDiffResult>;
}

export interface CompositionDiagnostic {
  code: string;
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
  return {
    code: "COMPOSITION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    nextAction: "Check the repository and selection, then try again.",
  };
}
