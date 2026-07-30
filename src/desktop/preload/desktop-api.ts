import {
  DESKTOP_CHANNELS,
  type ApiResult,
  type CancelCompositionRequest,
  type CommitPageRequest,
  type CompositeDiffResultDto,
  type CompositionRequest,
  type DesktopApi,
  type RangeRequest,
  type RangeResult,
  type RepositoryCommitPageDto,
  type RepositorySession,
} from "../shared/index.js";

type Invoke = (channel: string, input?: unknown) => Promise<unknown>;

export function createDesktopApi(invoke: Invoke): DesktopApi {
  return Object.freeze({
    selectRepository: () => invoke(
      DESKTOP_CHANNELS.selectRepository,
    ) as Promise<ApiResult<RepositorySession>>,
    openInitialRepository: () => invoke(
      DESKTOP_CHANNELS.openInitialRepository,
    ) as Promise<ApiResult<RepositorySession>>,
    loadRange: (request: RangeRequest) => invoke(
      DESKTOP_CHANNELS.loadRange,
      request,
    ) as Promise<ApiResult<RangeResult>>,
    listCommits: (request: CommitPageRequest) => invoke(
      DESKTOP_CHANNELS.listCommits,
      request,
    ) as Promise<ApiResult<RepositoryCommitPageDto>>,
    composeSelection: (request: CompositionRequest) => invoke(
      DESKTOP_CHANNELS.composeSelection,
      request,
    ) as Promise<ApiResult<CompositeDiffResultDto>>,
    cancelComposition: (request: CancelCompositionRequest) => invoke(
      DESKTOP_CHANNELS.cancelComposition,
      request,
    ) as Promise<ApiResult<null>>,
  });
}
