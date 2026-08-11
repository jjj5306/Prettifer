import type {
  ApiResult,
  CancelFileHistoryRequest,
  Diagnostic,
  FileCommitChangeDto,
  FileCommitRequest,
  FileHistoryPageDto,
  FileHistoryRequest,
} from "../shared/index.js";
import { fileCommitChangeSchema } from "../shared/index.js";
import {
  FileHistoryError,
  type FileCommitChange,
  type FileHistoryPage,
  type FileHistoryService,
} from "../../history/file-history-service.js";
import {
  RepositoryHistoryError,
  type RepositoryHistoryService,
} from "../../history/repository-history-service.js";
import { GitCommandAbortedError } from "../../git/git-command-runner.js";

interface RangeValidator {
  assertRangeCurrent(
    request: Parameters<RepositoryHistoryService["assertRangeCurrent"]>[0],
  ): Promise<void>;
}

interface FileHistoryReader {
  list(request: Parameters<FileHistoryService["list"]>[0]): Promise<FileHistoryPage>;
  readCommit(request: Parameters<FileHistoryService["readCommit"]>[0]): Promise<FileCommitChange>;
}

export class DesktopFileHistoryController {
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly history: RangeValidator,
    private readonly files: FileHistoryReader,
    private readonly lifetime?: AbortSignal,
  ) {}

  async list(
    request: FileHistoryRequest,
    repositoryPath: string,
  ): Promise<ApiResult<FileHistoryPageDto>> {
    return this.run(request, async (signal) => {
      await this.assertRange(request, repositoryPath, signal);
      const page = await this.files.list({
        repositoryPath,
        headCommit: request.range.headCommit,
        rangeRevision: request.range.rangeRevision,
        path: request.path,
        ...(request.offset === undefined ? {} : { offset: request.offset }),
        mainlineParents: request.mainlineParents ?? {},
        signal,
      });
      return {
        rangeRevision: page.rangeRevision,
        path: page.path,
        entries: page.entries.map((entry) => ({
          ...entry,
          parents: [...entry.parents],
        })),
        nextOffset: page.nextOffset,
        partial: page.partial === null ? null : { ...page.partial },
      };
    });
  }

  async readCommit(
    request: FileCommitRequest,
    repositoryPath: string,
  ): Promise<ApiResult<FileCommitChangeDto>> {
    return this.run(request, async (signal) => {
      await this.assertRange(request, repositoryPath, signal);
      const change = await this.files.readCommit({
        repositoryPath,
        commitId: request.commitId,
        path: request.path,
        requireMainline: request.selected,
        ...(request.mainlineParent === undefined
          ? {}
          : { mainlineParent: request.mainlineParent }),
        signal,
      });
      return fileCommitChangeSchema.parse(change);
    });
  }

  cancel(request: CancelFileHistoryRequest): ApiResult<null> {
    const prefix = `${request.repositorySessionId}:${String(request.sessionRevision)}:${request.requestId}:`;
    const match = [...this.active.keys()].find((identity) => identity.startsWith(prefix));
    if (match === undefined) {
      return {
        status: "error",
        diagnostic: {
          code: "REQUEST_EXPIRED",
          message: "The file history request is no longer active.",
          subject: request.requestId,
          nextAction: "Review the current file or open File History again.",
        },
      };
    }
    this.active.get(match)?.abort();
    this.active.delete(match);
    return { status: "success", data: null };
  }

  dispose(): void {
    for (const controller of this.active.values()) {
      controller.abort();
    }
    this.active.clear();
  }

  private async run<T>(
    request: FileHistoryRequest | FileCommitRequest,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<ApiResult<T>> {
    const identity = requestIdentity(request);
    this.active.get(identity)?.abort();
    const controller = new AbortController();
    this.active.set(identity, controller);
    const signal = this.lifetime === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, this.lifetime]);
    try {
      const data = await work(signal);
      return this.active.get(identity) === controller
        ? { status: "success", data }
        : { status: "cancelled" };
    } catch (error) {
      if (signal.aborted || error instanceof GitCommandAbortedError) {
        return { status: "cancelled" };
      }
      return { status: "error", diagnostic: fileHistoryDiagnostic(error) };
    } finally {
      if (this.active.get(identity) === controller) {
        this.active.delete(identity);
      }
    }
  }

  private assertRange(
    request: FileHistoryRequest | FileCommitRequest,
    repositoryPath: string,
    signal: AbortSignal,
  ): Promise<void> {
    return this.history.assertRangeCurrent({
      repositoryPath,
      range: {
        baseRef: request.range.baseRef,
        baseRefCommit: request.range.baseRefCommit,
        headRef: request.range.headRef,
        headCommit: request.range.headCommit,
        baseCommit: request.range.baseCommit,
        revision: request.range.rangeRevision,
      },
      signal,
    });
  }
}

function requestIdentity(request: FileHistoryRequest | FileCommitRequest): string {
  return [
    request.repositorySessionId,
    request.sessionRevision,
    request.requestId,
    request.range.rangeRevision,
  ].join(":");
}

function fileHistoryDiagnostic(error: unknown): Diagnostic {
  if (error instanceof FileHistoryError || error instanceof RepositoryHistoryError) {
    return {
      code: error.code,
      message: error.message,
      subject: error.subject,
      nextAction: error.nextAction,
    };
  }
  return {
    code: "FILE_HISTORY_FAILED",
    message: "The file history could not be loaded.",
    nextAction: "Check the repository history, then open File History again.",
  };
}
