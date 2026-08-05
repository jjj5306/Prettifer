import { resolve } from "node:path";

import {
  GitCommandError,
  GitCommandRunner,
  type GitRunOptions,
  type ProcessOutput,
} from "../git/git-command-runner.js";

export type RepositoryHistoryErrorCode =
  | "INVALID_REPOSITORY"
  | "GIT_UNAVAILABLE"
  | "BRANCH_NOT_FOUND"
  | "NO_COMMON_ANCESTOR"
  | "RANGE_STALE"
  | "COMMIT_NOT_SELECTABLE"
  | "HISTORY_FAILED";

export class RepositoryHistoryError extends Error {
  constructor(
    readonly code: RepositoryHistoryErrorCode,
    readonly subject: string,
    readonly nextAction: string,
    options?: ErrorOptions,
  ) {
    super(createHistoryErrorMessage(code, subject), options);
    this.name = "RepositoryHistoryError";
  }
}

export interface RepositoryBranch {
  readonly name: string;
  readonly commitId: string;
  readonly isCurrent: boolean;
}

export interface RepositorySnapshot {
  readonly rootPath: string;
  readonly currentBranch: string | null;
  readonly branches: readonly RepositoryBranch[];
}

export interface CreateRepositoryRangeRequest {
  readonly repositoryPath: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly signal?: AbortSignal;
}

export interface RepositoryRange {
  readonly baseRef: string;
  readonly baseRefCommit: string;
  readonly headRef: string;
  readonly headCommit: string;
  readonly baseCommit: string;
  readonly revision: string;
}

export interface RepositoryCommitParent {
  readonly id: string;
  readonly shortId: string;
  /**
   * Subject of the parent commit, or null when it was not read. Only a merge
   * offers its parents as a choice, so only a merge's parents are read.
   */
  readonly title: string | null;
}

export interface RepositoryCommit {
  readonly id: string;
  readonly shortId: string;
  /** Parents in the order Git records them: the first one is the mainline. */
  readonly parents: readonly RepositoryCommitParent[];
  readonly title: string;
  readonly authorName: string;
  readonly authoredAt: string;
  readonly isMerge: boolean;
  readonly selectable: boolean;
}

export interface ListRepositoryCommitsRequest {
  readonly repositoryPath: string;
  readonly range: RepositoryRange;
  readonly offset?: number;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface RepositoryCommitPage {
  readonly rangeRevision: string;
  readonly commits: readonly RepositoryCommit[];
  readonly nextOffset: number | null;
}

export class RepositoryHistoryService {
  constructor(private readonly git = new GitCommandRunner()) {}

  async getRepository(
    repositoryPath: string,
    signal?: AbortSignal,
  ): Promise<RepositorySnapshot> {
    const requestedPath = resolve(repositoryPath);
    let rootPath: string;
    try {
      const root = await this.git.run(
        ["rev-parse", "--show-toplevel"],
        runOptions(requestedPath, signal),
      );
      rootPath = resolve(root.stdout.trim());
    } catch (error) {
      if (isGitUnavailable(error)) {
        throw new RepositoryHistoryError(
          "GIT_UNAVAILABLE",
          requestedPath,
          "Install Git or check its executable path, then try again.",
          { cause: error },
        );
      }
      throw new RepositoryHistoryError(
        "INVALID_REPOSITORY",
        requestedPath,
        "Choose another Git repository folder.",
        { cause: error },
      );
    }

    try {
      const [currentBranch, branchOutput] = await Promise.all([
        this.git.run(["branch", "--show-current"], runOptions(rootPath, signal)),
        this.git.run(
          [
            "for-each-ref",
            "--sort=refname",
            "--format=%(refname:short)%00%(objectname)%00%(HEAD)%00",
            "refs/heads",
          ],
          runOptions(rootPath, signal),
        ),
      ]);
      return {
        rootPath,
        currentBranch: emptyToNull(currentBranch.stdout.trim()),
        branches: parseBranches(branchOutput.stdout),
      };
    } catch (error) {
      throw mapHistoryFailure(error, rootPath);
    }
  }

  async createRange(request: CreateRepositoryRangeRequest): Promise<RepositoryRange> {
    const repository = await this.getRepository(request.repositoryPath, request.signal);
    const baseBranch = findBranch(repository.branches, request.baseRef);
    const headBranch = findBranch(repository.branches, request.headRef);

    let baseCommit: string;
    try {
      const mergeBase = await this.git.run(
        ["merge-base", baseBranch.commitId, headBranch.commitId],
        runOptions(repository.rootPath, request.signal),
      );
      baseCommit = mergeBase.stdout.trim();
    } catch (error) {
      throw new RepositoryHistoryError(
        "NO_COMMON_ANCESTOR",
        `${request.baseRef}..${request.headRef}`,
        "Choose another branch or fetch the required Git history.",
        { cause: error },
      );
    }

    return {
      baseRef: baseBranch.name,
      baseRefCommit: baseBranch.commitId,
      headRef: headBranch.name,
      headCommit: headBranch.commitId,
      baseCommit,
      revision: createRangeRevision(baseBranch.commitId, headBranch.commitId, baseCommit),
    };
  }

  async listCommits(
    request: ListRepositoryCommitsRequest,
  ): Promise<RepositoryCommitPage> {
    await this.assertRangeCurrent({
      repositoryPath: request.repositoryPath,
      range: request.range,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 100;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RepositoryHistoryError(
        "HISTORY_FAILED",
        request.range.headRef,
        "Check the commit page range, then load it again.",
      );
    }

    let output: ProcessOutput;
    try {
      output = await this.git.run(
        [
          "log",
          "--first-parent",
          `--skip=${offset}`,
          `--max-count=${limit + 1}`,
          "--format=%H%x00%P%x00%s%x00%an%x00%aI%x1e",
          `${request.range.baseCommit}..${request.range.headCommit}`,
        ],
        runOptions(resolve(request.repositoryPath), request.signal),
      );
    } catch (error) {
      throw mapHistoryFailure(error, request.range.headRef);
    }

    const parsed = parseCommits(output.stdout);
    const hasNextPage = parsed.length > limit;
    const page = parsed.slice(0, limit);
    return {
      rangeRevision: request.range.revision,
      commits: await this.withMergeParentTitles(
        page,
        resolve(request.repositoryPath),
        request.signal,
      ),
      nextOffset: hasNextPage ? offset + limit : null,
    };
  }

  /**
   * Fills in the subject of every parent a merge on this page offers as a
   * choice. The commit format cannot carry a parent's subject, so this is a
   * second read; it is skipped when the page holds no merge, and the subjects
   * for the whole page are read together rather than once per merge.
   */
  private async withMergeParentTitles(
    commits: readonly RepositoryCommit[],
    repositoryPath: string,
    signal: AbortSignal | undefined,
  ): Promise<readonly RepositoryCommit[]> {
    const wanted = [
      ...new Set(
        commits
          .filter((commit) => commit.isMerge)
          .flatMap((commit) => commit.parents.map((parent) => parent.id)),
      ),
    ];
    if (wanted.length === 0) {
      return commits;
    }

    const titles = new Map<string, string>();
    for (const batch of inBatches(wanted, PARENT_TITLE_BATCH)) {
      let output: ProcessOutput;
      try {
        output = await this.git.run(
          ["log", "--no-walk", "--format=%H%x00%s%x1e", ...batch],
          runOptions(repositoryPath, signal),
        );
      } catch (error) {
        throw mapHistoryFailure(error, batch[0] ?? "commit-output");
      }
      for (const [id, title] of parseCommitTitles(output.stdout)) {
        titles.set(id, title);
      }
    }

    return commits.map((commit) => commit.isMerge
      ? {
        ...commit,
        parents: commit.parents.map((parent) => ({
          ...parent,
          title: titles.get(parent.id) ?? null,
        })),
      }
      : commit);
  }

  async assertRangeCurrent(request: {
    readonly repositoryPath: string;
    readonly range: RepositoryRange;
    readonly signal?: AbortSignal;
  }): Promise<void> {
    const repositoryPath = resolve(request.repositoryPath);
    try {
      const [baseRef, headRef] = await Promise.all([
        this.git.run(
          ["rev-parse", "--verify", `refs/heads/${request.range.baseRef}^{commit}`],
          runOptions(repositoryPath, request.signal),
        ),
        this.git.run(
          ["rev-parse", "--verify", `refs/heads/${request.range.headRef}^{commit}`],
          runOptions(repositoryPath, request.signal),
        ),
      ]);
      const currentBaseRefCommit = baseRef.stdout.trim();
      const currentHeadCommit = headRef.stdout.trim();
      const mergeBase = await this.git.run(
        ["merge-base", currentBaseRefCommit, currentHeadCommit],
        runOptions(repositoryPath, request.signal),
      );
      const currentBaseCommit = mergeBase.stdout.trim();
      if (
        currentBaseRefCommit !== request.range.baseRefCommit ||
        currentHeadCommit !== request.range.headCommit ||
        currentBaseCommit !== request.range.baseCommit ||
        createRangeRevision(
          currentBaseRefCommit,
          currentHeadCommit,
          currentBaseCommit,
        ) !== request.range.revision
      ) {
        throw new RepositoryHistoryError(
          "RANGE_STALE",
          request.range.headRef,
          "Reload the branch history, then select the commits again.",
        );
      }
    } catch (error) {
      if (error instanceof RepositoryHistoryError) {
        throw error;
      }
      throw new RepositoryHistoryError(
        "RANGE_STALE",
        request.range.headRef,
        "Reload the branch history, then select the commits again.",
        { cause: error },
      );
    }
  }

  async assertCompositionInput(request: {
    readonly repositoryPath: string;
    readonly range: RepositoryRange;
    readonly selectedCommits: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<void> {
    await this.assertRangeCurrent(request);
    const repositoryPath = resolve(request.repositoryPath);
    try {
      const output = await this.git.run(
        [
          "rev-list",
          "--first-parent",
          "--parents",
          `${request.range.baseCommit}..${request.range.headCommit}`,
        ],
        runOptions(repositoryPath, request.signal),
      );
      const selectable = new Set(
        output.stdout
          .split(/\r?\n/u)
          .flatMap((line) => {
            const [commit] = line.trim().split(/\s+/u);
            return commit === undefined || commit.length === 0 ? [] : [commit];
          }),
      );
      const unsupported = request.selectedCommits.find((commit) => !selectable.has(commit));
      if (unsupported !== undefined) {
        throw new RepositoryHistoryError(
          "COMMIT_NOT_SELECTABLE",
          unsupported,
          "Select commits from the displayed first-parent history.",
        );
      }
    } catch (error) {
      if (error instanceof RepositoryHistoryError) {
        throw error;
      }
      throw mapHistoryFailure(error, request.range.headRef);
    }
  }
}

function parseBranches(output: string): RepositoryBranch[] {
  const tokens = output.split("\0");
  const branches: RepositoryBranch[] = [];
  for (let index = 0; index + 2 < tokens.length; index += 3) {
    const name = stripRecordBreaks(tokens[index] ?? "");
    const commitId = tokens[index + 1] ?? "";
    const headMarker = tokens[index + 2] ?? "";
    if (name.length === 0 || commitId.length === 0) {
      continue;
    }
    branches.push({
      name,
      commitId,
      isCurrent: headMarker.trim() === "*",
    });
  }
  return branches.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * How many commit ids one parent-subject read carries. A page holds at most 100
 * commits, so a single read would still fit the command line; batching keeps
 * that true for a merge with an unusual number of parents.
 */
const PARENT_TITLE_BATCH = 100;

function* inBatches<T>(items: readonly T[], size: number): Generator<readonly T[]> {
  for (let start = 0; start < items.length; start += size) {
    yield items.slice(start, start + size);
  }
}

function parseCommitTitles(output: string): [string, string][] {
  return output
    .split("\x1e")
    .map((record) => stripRecordBreaks(record))
    .filter((record) => record.length > 0)
    .flatMap((record) => {
      const [id, title = ""] = record.split("\0");
      return id === undefined || id.length === 0 ? [] : [[id, title] as [string, string]];
    });
}

function parseCommits(output: string): RepositoryCommit[] {
  return output
    .split("\x1e")
    .map((record) => stripRecordBreaks(record))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [id, parents = "", title = "", authorName = "", authoredAt = ""] = record.split("\0");
      if (id === undefined || id.length === 0) {
        throw new RepositoryHistoryError(
          "HISTORY_FAILED",
          "commit-output",
          "Reload the commit history.",
        );
      }
      const parentIds = parents.length === 0 ? [] : parents.split(" ");
      const isMerge = parentIds.length > 1;
      return {
        id,
        shortId: id.slice(0, 7),
        parents: parentIds.map((parentId) => ({
          id: parentId,
          shortId: parentId.slice(0, 7),
          title: null,
        })),
        title,
        authorName,
        authoredAt,
        isMerge,
        // A merge is selectable once the user chooses its mainline parent.
        selectable: true,
      };
    });
}

function findBranch(
  branches: readonly RepositoryBranch[],
  branchName: string,
): RepositoryBranch {
  const branch = branches.find((candidate) => candidate.name === branchName);
  if (branch === undefined) {
    throw new RepositoryHistoryError(
      "BRANCH_NOT_FOUND",
      branchName,
      "Choose another local branch in the repository.",
    );
  }
  return branch;
}

function mapHistoryFailure(error: unknown, subject: string): RepositoryHistoryError {
  if (error instanceof RepositoryHistoryError) {
    return error;
  }
  if (isGitUnavailable(error)) {
    return new RepositoryHistoryError(
      "GIT_UNAVAILABLE",
      subject,
      "Install Git or check its executable path, then try again.",
      { cause: error },
    );
  }
  return new RepositoryHistoryError(
    "HISTORY_FAILED",
    subject,
    "Check the repository state, then reload the commit history.",
    { cause: error },
  );
}

function isGitUnavailable(error: unknown): boolean {
  return error instanceof GitCommandError && error.exitCode === -1;
}

function runOptions(cwd: string, signal: AbortSignal | undefined): GitRunOptions {
  return signal === undefined ? { cwd } : { cwd, signal };
}

function stripRecordBreaks(value: string): string {
  return value.replace(/^[\r\n]+|[\r\n]+$/gu, "");
}

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

function createRangeRevision(
  baseRefCommit: string,
  headCommit: string,
  baseCommit: string,
): string {
  return `${baseRefCommit}:${headCommit}:${baseCommit}`;
}

function createHistoryErrorMessage(code: RepositoryHistoryErrorCode, subject: string): string {
  switch (code) {
    case "INVALID_REPOSITORY":
      return `The Git repository could not be opened: ${subject}`;
    case "GIT_UNAVAILABLE":
      return "The Git executable is unavailable.";
    case "BRANCH_NOT_FOUND":
      return `The local branch could not be found: ${subject}`;
    case "NO_COMMON_ANCESTOR":
      return `No common history was found for the branches: ${subject}`;
    case "RANGE_STALE":
      return `The branch history has changed: ${subject}`;
    case "COMMIT_NOT_SELECTABLE":
      return `This commit cannot be included in the selected result: ${subject}`;
    case "HISTORY_FAILED":
      return `The commit history could not be loaded: ${subject}`;
  }
}
