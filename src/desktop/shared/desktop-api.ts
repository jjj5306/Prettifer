import { z } from "zod";

import { GROUP_RULE_LIMIT } from "../../grouping/group-rule.js";

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

export const repositoryCommitParentSchema = z.object({
  id: commitIdSchema,
  shortId: z.string().regex(/^[0-9a-f]{7}$/u),
  /**
   * Subject of the parent commit, or null when it was not read. Only a merge
   * offers its parents as a choice, so only a merge's parents carry a subject.
   */
  title: z.string().nullable(),
}).strict();

export const repositoryCommitSchema = z.object({
  id: commitIdSchema,
  shortId: z.string().regex(/^[0-9a-f]{7}$/u),
  /** Parents in the order Git records them: the first one is the mainline. */
  parents: z.array(repositoryCommitParentSchema),
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
const repositoryRelativePathSchema = compositeFilePathSchema.refine((path) =>
  !path.startsWith("/")
  && !path.includes("\\")
  && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
{ message: "The file path must be a normalized repository-relative path." });

const fileChangeStatusSchema = z.enum(["added", "modified", "deleted", "renamed"]);

export const fileHistoryRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  requestId: z.uuid(),
  path: repositoryRelativePathSchema,
  offset: z.number().int().nonnegative().default(0),
  mainlineParents: mainlineParentsSchema.default({}),
}).strict();

export const fileHistoryEntrySchema = z.object({
  id: commitIdSchema,
  shortId: z.string().regex(/^[0-9a-f]{7}$/u),
  parents: z.array(commitIdSchema),
  title: z.string(),
  authorName: z.string(),
  authoredAt: z.iso.datetime({ offset: true }),
  status: fileChangeStatusSchema,
  path: compositeFilePathSchema,
  previousPath: compositeFilePathSchema.optional(),
  similarity: z.number().int().min(0).max(100).optional(),
}).strict().superRefine((entry, context) => {
  if (entry.status === "renamed" && entry.previousPath === undefined) {
    context.addIssue({
      code: "custom",
      message: "A renamed file history entry requires its previous path.",
      path: ["previousPath"],
    });
  }
});

export const partialFileHistorySchema = z.object({
  reason: z.literal("shallow"),
  message: z.string().min(1),
  nextAction: z.string().min(1),
}).strict();

export const fileHistoryPageSchema = z.object({
  rangeRevision: z.string().min(1),
  path: compositeFilePathSchema,
  entries: z.array(fileHistoryEntrySchema),
  nextOffset: z.number().int().nonnegative().nullable(),
  partial: partialFileHistorySchema.nullable(),
}).strict();

export const fileCommitRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  requestId: z.uuid(),
  path: repositoryRelativePathSchema,
  commitId: commitIdSchema,
  selected: z.boolean().default(false),
  mainlineParent: z.number().int().positive().optional(),
}).strict();

export const cancelFileHistoryRequestSchema = sessionIdentitySchema.extend({
  requestId: z.uuid(),
}).strict();

const fileCommitChangeBase = {
  commitId: commitIdSchema,
  parentCommit: commitIdSchema.nullable(),
  parentNumber: z.number().int().positive().nullable(),
  path: compositeFilePathSchema,
  beforeSize: z.number().int().nonnegative().nullable(),
  afterSize: z.number().int().nonnegative().nullable(),
} as const;

export const fileCommitChangeSchema = z.union([
  z.object({
    ...fileCommitChangeBase,
    status: z.literal("added"),
    beforeContent: z.null(),
    afterContent: z.string(),
    binary: z.literal(false),
  }).strict(),
  z.object({
    ...fileCommitChangeBase,
    status: z.literal("modified"),
    beforeContent: z.string(),
    afterContent: z.string(),
    binary: z.literal(false),
  }).strict(),
  z.object({
    ...fileCommitChangeBase,
    status: z.literal("deleted"),
    beforeContent: z.string(),
    afterContent: z.null(),
    binary: z.literal(false),
  }).strict(),
  z.object({
    ...fileCommitChangeBase,
    status: z.literal("renamed"),
    previousPath: compositeFilePathSchema,
    similarity: z.number().int().min(0).max(100),
    beforeContent: z.string(),
    afterContent: z.string(),
    binary: z.literal(false),
  }).strict(),
  z.object({
    ...fileCommitChangeBase,
    status: fileChangeStatusSchema,
    previousPath: compositeFilePathSchema.optional(),
    similarity: z.number().int().min(0).max(100).optional(),
    beforeContent: z.null(),
    afterContent: z.null(),
    binary: z.literal(true),
  }).strict(),
]);

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

/**
 * The paths tracked at one side of the comparison. Review defaults to the
 * comparison base; file-history browsing explicitly asks for the target.
 */
export const baseTreeRequestSchema = sessionIdentitySchema.extend({
  range: repositoryRangeSchema,
  /** Which side supplies the repository file list. Defaults to the comparison base. */
  revision: z.enum(["base", "head"]).optional(),
}).strict();

export const baseTreeSchema = z.object({
  paths: z.array(compositeFilePathSchema),
  /** True when the limit cut the list, so the screen can say so. */
  truncated: z.boolean(),
}).strict();


const textFileFields = {
  path: compositeFilePathSchema,
  binary: z.never().optional(),
} as const;

/**
 * What a renamed file carries beyond its current path: the path it had at the
 * comparison base, and how much of the content Git matched to decide the two
 * are the same file.
 */
const renamedFileFields = {
  previousPath: compositeFilePathSchema,
  similarity: z.number().int().min(0).max(100),
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
    ...textFileFields,
    status: z.literal("renamed"),
    ...renamedFileFields,
    beforeContent: z.string(),
    afterContent: z.string(),
  }).strict(),
  z.object({
    path: compositeFilePathSchema,
    status: z.enum(["added", "modified", "deleted"]),
    binary: z.literal(true),
    beforeContent: z.null(),
    afterContent: z.null(),
  }).strict(),
  z.object({
    path: compositeFilePathSchema,
    status: z.literal("renamed"),
    ...renamedFileFields,
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
  fileContributions: z.array(z.object({
    path: compositeFilePathSchema,
    commits: z.array(commitIdSchema),
  }).strict()).optional(),
  unifiedDiff: z.string(),
}).strict();

/**
 * One grouping rule as it travels between the window and the main process. Only
 * the shape and a bounded size are checked here; whether a rule can be applied
 * is decided by the grouping core, which both sides share.
 */
export const groupRuleSchema = z.object({
  prefix: z.string().max(512),
  name: z.string().max(120),
}).strict();

export const groupingRulesRequestSchema = sessionIdentitySchema.strict();

export const saveGroupingRulesRequestSchema = sessionIdentitySchema.extend({
  rules: z.array(groupRuleSchema).max(GROUP_RULE_LIMIT),
}).strict();

export const groupingRulesSchema = z.object({
  rules: z.array(groupRuleSchema),
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
export type BaseTreeRequest = z.infer<typeof baseTreeRequestSchema>;
export type BaseTreeDto = z.infer<typeof baseTreeSchema>;
export type FileHistoryRequest = z.input<typeof fileHistoryRequestSchema>;
export type FileHistoryEntryDto = z.infer<typeof fileHistoryEntrySchema>;
export type FileHistoryPageDto = z.infer<typeof fileHistoryPageSchema>;
export type FileCommitRequest = z.infer<typeof fileCommitRequestSchema>;
export type FileCommitChangeDto = z.infer<typeof fileCommitChangeSchema>;
export type CancelFileHistoryRequest = z.infer<typeof cancelFileHistoryRequestSchema>;
export type GroupRuleDto = z.infer<typeof groupRuleSchema>;
export type GroupingRulesRequest = z.infer<typeof groupingRulesRequestSchema>;
export type SaveGroupingRulesRequest = z.infer<typeof saveGroupingRulesRequestSchema>;
export type GroupingRulesDto = z.infer<typeof groupingRulesSchema>;
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
  listBaseTree: "files:list-base-tree",
  listFileHistory: "files:list-history",
  readFileCommit: "files:read-history-commit",
  cancelFileHistory: "files:cancel-history",
  readGroupingRules: "grouping:read-rules",
  saveGroupingRules: "grouping:save-rules",
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
  /** Lists the paths tracked at the range's comparison base. */
  listBaseTree(request: BaseTreeRequest): Promise<ApiResult<BaseTreeDto>>;
  /** Lists commits that changed one file on the range's target branch. */
  listFileHistory(request: FileHistoryRequest): Promise<ApiResult<FileHistoryPageDto>>;
  /** Reads the selected file as changed by one history commit. */
  readFileCommit(request: FileCommitRequest): Promise<ApiResult<FileCommitChangeDto>>;
  /** Cancels an active file-history list or commit read. */
  cancelFileHistory(request: CancelFileHistoryRequest): Promise<ApiResult<null>>;
  /** Reads the grouping rules kept for the session's repository. */
  readGroupingRules(request: GroupingRulesRequest): Promise<ApiResult<GroupingRulesDto>>;
  /** Replaces the grouping rules kept for the session's repository. */
  saveGroupingRules(request: SaveGroupingRulesRequest): Promise<ApiResult<GroupingRulesDto>>;
}
