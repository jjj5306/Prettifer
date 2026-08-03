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
      message: "The comparison revision does not match the branch commits.",
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

/** Mainline parent number per merge commit, keyed by full commit id. */
/** Mainline parent number per merge commit, keyed by full commit id. */
export const mainlineParentsSchema = z.record(
  commitIdSchema,
  z.number().int().positive(),
);

export const compositionRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  requestId: z.uuid(),
  selectedCommits: z.array(commitIdSchema).min(1),
  mainlineParents: mainlineParentsSchema.default({}),
}).strict();

export const cancelCompositionRequestSchema = sessionIdentitySchema.extend({
  requestId: z.uuid(),
}).strict();

const compositeFilePathSchema = z.string().min(1);

/** A symbol lookup asks for one identifier at the range's comparison base. */
export const symbolSearchRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  symbol: z.string().trim().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/u),
}).strict();

/** What a line declares. `null` means the line only mentions the symbol. */
export const declarationKindSchema = z.enum([
  "type",
  "constructor",
  "method",
  "field",
  "variable",
  "alias",
  "macro",
]);

export const symbolHitSchema = z.object({
  path: compositeFilePathSchema,
  line: z.number().int().positive(),
  text: z.string(),
  kind: declarationKindSchema.nullable(),
}).strict();

export const symbolSearchResultSchema = z.object({
  hits: z.array(symbolHitSchema),
  /** True when the limit cut the list, so the screen can say so. */
  truncated: z.boolean(),
}).strict();

/**
 * A navigation can land on a file the selection never changed, which is not in
 * the composed result. Such a file is read at the comparison base.
 */
export const baseFileRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  path: compositeFilePathSchema,
}).strict();

export const baseFileSchema = z.object({
  path: compositeFilePathSchema,
  contents: z.string(),
}).strict();


const textFileFields = {
  path: compositeFilePathSchema,
  binary: z.never().optional(),
} as const;

export const compositeFileChangeSchema = z.union([
  z.object({
    ...textFileFields,
    status: z.literal("added"),
    beforeContent: z.null(),
    afterContent: z.string(),
  }).strict(),
  z.object({
    ...textFileFields,
    status: z.literal("modified"),
    beforeContent: z.string(),
    afterContent: z.string(),
  }).strict(),
  z.object({
    ...textFileFields,
    status: z.literal("deleted"),
    beforeContent: z.string(),
    afterContent: z.null(),
  }).strict(),
  z.object({
    path: compositeFilePathSchema,
    status: z.enum(["added", "modified", "deleted"]),
    binary: z.literal(true),
    beforeContent: z.null(),
    afterContent: z.null(),
  }).strict(),
]);

export const compositeProblemFileSchema = z.object({
  path: compositeFilePathSchema,
  code: z.literal("CONTENT_CHOICE_REQUIRED"),
  commit: commitIdSchema,
  nextAction: z.string().min(1),
}).strict();

export const compositeDiffResultSchema = z.object({
  baseCommit: commitIdSchema,
  selectedCommits: z.array(commitIdSchema),
  mainlineParents: mainlineParentsSchema,
  files: z.array(compositeFileChangeSchema),
  problemFiles: z.array(compositeProblemFileSchema),
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
export type SymbolSearchRequest = z.infer<typeof symbolSearchRequestSchema>;
export type SymbolHitDto = z.infer<typeof symbolHitSchema>;
export type DeclarationKindDto = z.infer<typeof declarationKindSchema>;
export type SymbolSearchResultDto = z.infer<typeof symbolSearchResultSchema>;
export type BaseFileRequest = z.infer<typeof baseFileRequestSchema>;
export type BaseFileDto = z.infer<typeof baseFileSchema>;
export type ApiResult<T> =
  | Readonly<{ status: "success"; data: T }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "error"; diagnostic: Diagnostic }>;

export const DESKTOP_CHANNELS = Object.freeze({
  selectRepository: "repository:select",
  openInitialRepository: "repository:initial",
  loadRange: "repository:load-range",
  listCommits: "repository:list-commits",
  composeSelection: "composition:create",
  cancelComposition: "composition:cancel",
  searchSymbol: "symbols:search",
  readBaseFile: "files:read-base",
});

export interface DesktopApi {
  selectRepository(): Promise<ApiResult<RepositorySession>>;
  /** Opens the repository the app was started with, if the user gave one. */
  openInitialRepository(): Promise<ApiResult<RepositorySession>>;
  loadRange(request: RangeRequest): Promise<ApiResult<RangeResult>>;
  listCommits(request: CommitPageRequest): Promise<ApiResult<RepositoryCommitPageDto>>;
  /** Finds a symbol across the repository at the range's comparison base. */
  searchSymbol(request: SymbolSearchRequest): Promise<ApiResult<SymbolSearchResultDto>>;
  composeSelection(request: CompositionRequest): Promise<ApiResult<CompositeDiffResultDto>>;
  cancelComposition(request: CancelCompositionRequest): Promise<ApiResult<null>>;
  /** Reads one file at the range's comparison base, for navigation outside the result. */
  readBaseFile(request: BaseFileRequest): Promise<ApiResult<BaseFileDto>>;
}
