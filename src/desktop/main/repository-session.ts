import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { ApiResult, RepositorySession } from "../shared/index.js";
import {
  RepositoryHistoryError,
  type RepositorySnapshot,
} from "../../history/repository-history-service.js";

interface RepositoryReader {
  getRepository(repositoryPath: string, signal?: AbortSignal): Promise<RepositorySnapshot>;
}

interface FolderSelector {
  selectFolder(): Promise<string | null>;
}

export class RepositorySessionError extends Error {
  readonly code = "SESSION_EXPIRED";
  readonly nextAction = "Reload the repository and its branch history.";

  constructor(readonly subject: string) {
    super("The repository session has expired.");
    this.name = "RepositorySessionError";
  }
}

export class RepositorySessionManager {
  private currentSession: RepositorySession | undefined;
  private revision = 0;

  constructor(
    private readonly repositories: RepositoryReader,
    private readonly normalizePath: (path: string) => string = resolve,
    private readonly createId: () => string = randomUUID,
    private readonly beforeReplace: () => void = () => undefined,
  ) {}

  async open(selectedPath: string, signal?: AbortSignal): Promise<RepositorySession> {
    const normalizedPath = this.normalizePath(selectedPath);
    const repository = signal === undefined
      ? await this.repositories.getRepository(normalizedPath)
      : await this.repositories.getRepository(normalizedPath, signal);
    if (this.currentSession !== undefined) {
      this.beforeReplace();
    }
    const nextRevision = this.revision + 1;
    const session: RepositorySession = {
      repositorySessionId: this.createId(),
      sessionRevision: nextRevision,
      rootPath: repository.rootPath,
      currentBranch: repository.currentBranch,
      branches: repository.branches.map((branch) => ({ ...branch })),
    };
    this.revision = nextRevision;
    this.currentSession = session;
    return session;
  }

  require(repositorySessionId: string, sessionRevision: number): RepositorySession {
    const session = this.currentSession;
    if (
      session?.repositorySessionId !== repositorySessionId ||
      session.sessionRevision !== sessionRevision
    ) {
      throw new RepositorySessionError(repositorySessionId);
    }
    return session;
  }

  clear(): void {
    this.currentSession = undefined;
  }
}

export class RepositorySessionController {
  constructor(
    private readonly sessions: RepositorySessionManager,
    private readonly folders: FolderSelector,
    private readonly signal?: AbortSignal,
    /** Path the app was started with, when the user passed one. */
    private readonly initialPath: () => string | null = () => null,
  ) {}

  async selectRepository(): Promise<ApiResult<RepositorySession>> {
    const selectedPath = await this.folders.selectFolder();
    if (selectedPath === null) {
      return { status: "cancelled" };
    }
    return this.open(selectedPath);
  }

  /**
   * Opens the repository the app was started with. Reports a cancellation when
   * no path was given, which leaves the screen exactly as it starts.
   */
  async openInitialRepository(): Promise<ApiResult<RepositorySession>> {
    const startupPath = this.initialPath();
    if (startupPath === null) {
      return { status: "cancelled" };
    }
    return this.open(startupPath);
  }

  /** Both paths share one validation and one diagnostic translation. */
  private async open(selectedPath: string): Promise<ApiResult<RepositorySession>> {
    try {
      return { status: "success", data: await this.sessions.open(selectedPath, this.signal) };
    } catch (error) {
      return { status: "error", diagnostic: toSessionDiagnostic(error) };
    }
  }
}

function toSessionDiagnostic(error: unknown) {
  if (error instanceof RepositoryHistoryError) {
    return {
      code: error.code,
      message: error.message,
      subject: error.subject,
      nextAction: error.nextAction,
    };
  }
  return {
    code: "REPOSITORY_OPEN_FAILED",
    message: "The repository could not be opened.",
    nextAction: "Check the folder and Git state, then try again.",
  };
}
