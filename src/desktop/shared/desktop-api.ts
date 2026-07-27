import { z } from "zod";

const commitIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const branchNameSchema = z.string().trim().min(1).max(255);
const sessionIdentitySchema = z.object({
  repositorySessionId: z.uuid(),
  sessionRevision: z.number().int().positive(),
}).strict();

export const diagnosticSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  subject: z.string().trim().min(1).optional(),
  nextAction: z.string().trim().min(1),
}).strict();

export const repositoryBranchSchema = z.object({
  name: branchNameSchema,
  commitId: commitIdSchema,
  isCurrent: z.boolean(),
}).strict();

export const repositorySessionSchema = z.object({
  repositorySessionId: z.uuid(),
  sessionRevision: z.number().int().positive(),
  rootPath: z.string().trim().min(1),
  currentBranch: branchNameSchema.nullable(),
  branches: z.array(repositoryBranchSchema),
}).strict();

export const rangeRequestSchema = sessionIdentitySchema.extend({
  baseRef: branchNameSchema,
  headRef: branchNameSchema,
}).strict();

export const repositoryRangeSchema = z.object({
  baseRef: branchNameSchema,
  baseRefCommit: commitIdSchema,
  headRef: branchNameSchema,
  headCommit: commitIdSchema,
  baseCommit: commitIdSchema,
  rangeRevision: z.string().trim().min(1),
}).strict().superRefine((range, context) => {
  const expected = `${range.baseRefCommit}:${range.headCommit}:${range.baseCommit}`;
  if (range.rangeRevision !== expected) {
    context.addIssue({
      code: "custom",
      message: "비교 범위 revision이 브랜치 커밋과 일치하지 않습니다.",
      path: ["rangeRevision"],
    });
  }
});

export const repositoryCommitSchema = z.object({
  id: commitIdSchema,
  shortId: z.string().regex(/^[0-9a-f]{7}$/u),
  parentIds: z.array(commitIdSchema),
  title: z.string(),
  authorName: z.string(),
  authoredAt: z.iso.datetime({ offset: true }),
  isMerge: z.boolean(),
  selectable: z.boolean(),
}).strict();

export const repositoryCommitPageSchema = z.object({
  rangeRevision: z.string().trim().min(1),
  commits: z.array(repositoryCommitSchema),
  nextOffset: z.number().int().nonnegative().nullable(),
}).strict();

export const commitPageRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  offset: z.number().int().nonnegative().default(0),
}).strict();

export const compositionRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  requestId: z.uuid(),
  selectedCommits: z.array(commitIdSchema).min(1),
}).strict();

export const cancelCompositionRequestSchema = sessionIdentitySchema.extend({
  requestId: z.uuid(),
}).strict();

export const compositeFileChangeSchema = z.object({
  path: z.string().min(1),
  status: z.enum(["added", "modified", "deleted"]),
  beforeContent: z.string().nullable(),
  afterContent: z.string().nullable(),
}).strict();

export const compositeDiffResultSchema = z.object({
  baseCommit: commitIdSchema,
  selectedCommits: z.array(commitIdSchema),
  files: z.array(compositeFileChangeSchema),
  unifiedDiff: z.string(),
}).strict();

export const rangeResultSchema = z.object({
  range: repositoryRangeSchema,
  page: repositoryCommitPageSchema,
}).strict();

export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type RepositorySession = z.infer<typeof repositorySessionSchema>;
export type RangeRequest = z.infer<typeof rangeRequestSchema>;
export type RepositoryRangeDto = z.infer<typeof repositoryRangeSchema>;
export type CommitPageRequest = z.input<typeof commitPageRequestSchema>;
export type RepositoryCommitDto = z.infer<typeof repositoryCommitSchema>;
export type RepositoryCommitPageDto = z.infer<typeof repositoryCommitPageSchema>;
export type CompositionRequest = z.infer<typeof compositionRequestSchema>;
export type CancelCompositionRequest = z.infer<typeof cancelCompositionRequestSchema>;
export type CompositeDiffResultDto = z.infer<typeof compositeDiffResultSchema>;
export type RangeResult = z.infer<typeof rangeResultSchema>;
export type ApiResult<T> =
  | Readonly<{ status: "success"; data: T }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "error"; diagnostic: Diagnostic }>;

export const DESKTOP_CHANNELS = Object.freeze({
  selectRepository: "repository:select",
  loadRange: "repository:load-range",
  listCommits: "repository:list-commits",
  composeSelection: "composition:create",
  cancelComposition: "composition:cancel",
});

export interface DesktopApi {
  selectRepository(): Promise<ApiResult<RepositorySession>>;
  loadRange(request: RangeRequest): Promise<ApiResult<RangeResult>>;
  listCommits(request: CommitPageRequest): Promise<ApiResult<RepositoryCommitPageDto>>;
  composeSelection(request: CompositionRequest): Promise<ApiResult<CompositeDiffResultDto>>;
  cancelComposition(request: CancelCompositionRequest): Promise<ApiResult<null>>;
}
