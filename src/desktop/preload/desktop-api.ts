import {
  DESKTOP_CHANNELS,
  type ApiResult,
  type BaseFileDto,
  type BaseFileRequest,
  type CancelCompositionRequest,
  type CommitPageRequest,
  type CompositeDiffResultDto,
  type CompositionRequest,
  type DesktopApi,
  type GroupingRulesDto,
  type GroupingRulesRequest,
  type RangeRequest,
  type RangeResult,
  type RepositoryCommitPageDto,
  type RepositorySession,
  type SaveGroupingRulesRequest,
  type SymbolSearchRequest,
  type SymbolSearchResultDto,
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
    searchSymbol: (request: SymbolSearchRequest) => invoke(
      DESKTOP_CHANNELS.searchSymbol,
      request,
    ) as Promise<ApiResult<SymbolSearchResultDto>>,
    cancelComposition: (request: CancelCompositionRequest) => invoke(
      DESKTOP_CHANNELS.cancelComposition,
      request,
    ) as Promise<ApiResult<null>>,
    readBaseFile: (request: BaseFileRequest) => invoke(
      DESKTOP_CHANNELS.readBaseFile,
      request,
    ) as Promise<ApiResult<BaseFileDto>>,
    readGroupingRules: (request: GroupingRulesRequest) => invoke(
      DESKTOP_CHANNELS.readGroupingRules,
      request,
    ) as Promise<ApiResult<GroupingRulesDto>>,
    saveGroupingRules: (request: SaveGroupingRulesRequest) => invoke(
      DESKTOP_CHANNELS.saveGroupingRules,
      request,
    ) as Promise<ApiResult<GroupingRulesDto>>,
  });
}
