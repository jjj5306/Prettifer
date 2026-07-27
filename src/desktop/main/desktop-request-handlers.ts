import {
  cancelCompositionRequestSchema,
  commitPageRequestSchema,
  compositionRequestSchema,
  rangeRequestSchema,
  type ApiResult,
  type CancelCompositionRequest,
  type CommitPageRequest,
  type CompositeDiffResultDto,
  type CompositionRequest,
  type Diagnostic,
  type RangeRequest,
  type RangeResult,
  type RepositoryCommitPageDto,
  type RepositoryRangeDto,
  type RepositorySession,
} from "../shared/index.js";
import {
  RepositoryHistoryError,
  type RepositoryCommitPage,
  type RepositoryRange,
} from "../../history/repository-history-service.js";
import { RepositorySessionError } from "./repository-session.js";
import { applicationUrlsMatch } from "./application-url.js";

export interface DesktopInvokeEvent {
  readonly senderId: number;
  readonly frameUrl: string;
}

interface TrustedWindow {
  readonly senderId: number;
  readonly frameUrl: string;
}

interface SessionReader {
  require(repositorySessionId: string, sessionRevision: number): RepositorySession;
}

interface RepositorySelector {
  selectRepository(): Promise<ApiResult<RepositorySession>>;
}

interface HistoryReader {
  createRange(request: {
    readonly repositoryPath: string;
    readonly baseRef: string;
    readonly headRef: string;
    readonly signal?: AbortSignal;
  }): Promise<RepositoryRange>;
  listCommits(request: {
    readonly repositoryPath: string;
    readonly range: RepositoryRange;
    readonly offset?: number;
    readonly signal?: AbortSignal;
  }): Promise<RepositoryCommitPage>;
}

interface CompositionBoundary {
  compose(
    request: CompositionRequest,
    repositoryPath: string,
  ): Promise<ApiResult<CompositeDiffResultDto>>;
  cancel(
    request: CancelCompositionRequest,
  ): ApiResult<null> | Promise<ApiResult<null>>;
}

interface DesktopRequestDependencies {
  readonly trustedWindow: () => TrustedWindow | undefined;
  readonly sessions: SessionReader;
  readonly repositoryController: RepositorySelector;
  readonly history: HistoryReader;
  readonly composition: CompositionBoundary;
  readonly signal?: AbortSignal;
}

export function createDesktopRequestHandlers(dependencies: DesktopRequestDependencies) {
  return {
    selectRepository: (event: DesktopInvokeEvent) => handleRequest(
      event,
      dependencies,
      () => dependencies.repositoryController.selectRepository(),
    ),
    loadRange: (event: DesktopInvokeEvent, input: unknown) => handleRequest(
      event,
      dependencies,
      async () => loadRange(dependencies, parseRequest(rangeRequestSchema, input)),
    ),
    listCommits: (event: DesktopInvokeEvent, input: unknown) => handleRequest(
      event,
      dependencies,
      async () => listCommits(dependencies, parseRequest(commitPageRequestSchema, input)),
    ),
    composeSelection: (event: DesktopInvokeEvent, input: unknown) => handleRequest(
      event,
      dependencies,
      async () => {
        const request = parseRequest(compositionRequestSchema, input);
        const session = requireSession(dependencies, request);
        assertRangeBelongsToSession(session, request.range);
        return dependencies.composition.compose(request, session.rootPath);
      },
    ),
    cancelComposition: (event: DesktopInvokeEvent, input: unknown) => handleRequest(
      event,
      dependencies,
      async () => {
        const request = parseRequest(cancelCompositionRequestSchema, input);
        requireSession(dependencies, request);
        return dependencies.composition.cancel(request);
      },
    ),
  };
}

async function loadRange(
  dependencies: DesktopRequestDependencies,
  request: RangeRequest,
): Promise<ApiResult<RangeResult>> {
  const session = requireSession(dependencies, request);
  const range = await dependencies.history.createRange({
    repositoryPath: session.rootPath,
    baseRef: request.baseRef,
    headRef: request.headRef,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  });
  assertRangeBelongsToSession(session, toRangeDto(range));
  const page = await dependencies.history.listCommits({
    repositoryPath: session.rootPath,
    range,
    offset: 0,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  });
  return {
    status: "success",
    data: { range: toRangeDto(range), page: toCommitPageDto(page) },
  };
}

async function listCommits(
  dependencies: DesktopRequestDependencies,
  request: CommitPageRequest,
): Promise<ApiResult<RepositoryCommitPageDto>> {
  const session = requireSession(dependencies, request);
  assertRangeBelongsToSession(session, request.range);
  const page = await dependencies.history.listCommits({
    repositoryPath: session.rootPath,
    range: fromRangeDto(request.range),
    ...(request.offset === undefined ? {} : { offset: request.offset }),
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  });
  return { status: "success", data: toCommitPageDto(page) };
}

function requireSession(
  dependencies: DesktopRequestDependencies,
  request: { readonly repositorySessionId: string; readonly sessionRevision: number },
): RepositorySession {
  return dependencies.sessions.require(
    request.repositorySessionId,
    request.sessionRevision,
  );
}

function assertRangeBelongsToSession(
  session: RepositorySession,
  range: RepositoryRangeDto,
): void {
  const base = session.branches.find((branch) => branch.name === range.baseRef);
  const head = session.branches.find((branch) => branch.name === range.headRef);
  if (base?.commitId !== range.baseRefCommit || head?.commitId !== range.headCommit) {
    throw new RequestBoundaryError(
      "RANGE_EXPIRED",
      range.headRef,
      "Reload the branch history, then select the commits again.",
      "The comparison range does not match the current repository session.",
    );
  }
}

function toRangeDto(range: RepositoryRange): RepositoryRangeDto {
  return {
    baseRef: range.baseRef,
    baseRefCommit: range.baseRefCommit,
    headRef: range.headRef,
    headCommit: range.headCommit,
    baseCommit: range.baseCommit,
    rangeRevision: range.revision,
  };
}

function fromRangeDto(range: RepositoryRangeDto): RepositoryRange {
  return {
    baseRef: range.baseRef,
    baseRefCommit: range.baseRefCommit,
    headRef: range.headRef,
    headCommit: range.headCommit,
    baseCommit: range.baseCommit,
    revision: range.rangeRevision,
  };
}

function toCommitPageDto(page: RepositoryCommitPage): RepositoryCommitPageDto {
  return {
    rangeRevision: page.rangeRevision,
    commits: page.commits.map((commit) => ({
      ...commit,
      parentIds: [...commit.parentIds],
    })),
    nextOffset: page.nextOffset,
  };
}

async function handleRequest<T>(
  event: DesktopInvokeEvent,
  dependencies: DesktopRequestDependencies,
  action: () => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  try {
    assertTrustedSender(event, dependencies.trustedWindow());
    return await action();
  } catch (error) {
    return { status: "error", diagnostic: toDiagnostic(error) };
  }
}

function assertTrustedSender(
  event: DesktopInvokeEvent,
  trustedWindow: TrustedWindow | undefined,
): void {
  if (
    event.senderId !== trustedWindow?.senderId ||
    !applicationUrlsMatch(event.frameUrl, trustedWindow.frameUrl)
  ) {
    throw new RequestBoundaryError(
      "UNTRUSTED_SENDER",
      event.frameUrl,
      "Try again from the current Prettifer window.",
      "The request came from an untrusted view.",
    );
  }
}

function parseRequest<T>(schema: { parse(input: unknown): T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    throw new RequestBoundaryError(
      "INVALID_REQUEST",
      "request",
      "Reopen the window, then try again.",
      "The request data is invalid.",
      { cause: error },
    );
  }
}

class RequestBoundaryError extends Error {
  constructor(
    readonly code: string,
    readonly subject: string,
    readonly nextAction: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RequestBoundaryError";
  }
}

function toDiagnostic(error: unknown): Diagnostic {
  if (
    error instanceof RequestBoundaryError ||
    error instanceof RepositorySessionError ||
    error instanceof RepositoryHistoryError
  ) {
    return {
      code: error.code,
      message: error.message,
      subject: error.subject,
      nextAction: error.nextAction,
    };
  }
  return {
    code: "REQUEST_FAILED",
    message: "The request could not be processed.",
    nextAction: "Check the repository state, then try again.",
  };
}
