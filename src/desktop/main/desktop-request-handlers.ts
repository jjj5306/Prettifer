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
      "브랜치 이력을 새로 불러온 뒤 다시 선택해 주세요.",
      "비교 범위가 현재 저장소 세션과 일치하지 않습니다.",
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
      "현재 Prettifer 창에서 다시 시도해 주세요.",
      "허용되지 않은 화면에서 요청했습니다.",
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
      "화면을 새로 연 뒤 다시 시도해 주세요.",
      "요청 자료가 올바르지 않습니다.",
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
    message: "요청을 처리할 수 없습니다.",
    nextAction: "저장소 상태를 확인한 뒤 다시 시도해 주세요.",
  };
}
