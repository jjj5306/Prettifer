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

export interface RepositoryCommit {
  readonly id: string;
  readonly shortId: string;
  readonly parentIds: readonly string[];
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
          "Git을 설치하거나 실행 경로를 확인한 뒤 다시 시도해 주세요.",
          { cause: error },
        );
      }
      throw new RepositoryHistoryError(
        "INVALID_REPOSITORY",
        requestedPath,
        "다른 Git 저장소 폴더를 선택해 주세요.",
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
        "다른 브랜치를 선택하거나 필요한 Git 이력을 준비해 주세요.",
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
        "커밋 페이지 범위를 확인한 뒤 다시 불러와 주세요.",
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
    return {
      rangeRevision: request.range.revision,
      commits: parsed.slice(0, limit),
      nextOffset: hasNextPage ? offset + limit : null,
    };
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
          "브랜치 이력을 새로 불러온 뒤 다시 선택해 주세요.",
        );
      }
    } catch (error) {
      if (error instanceof RepositoryHistoryError) {
        throw error;
      }
      throw new RepositoryHistoryError(
        "RANGE_STALE",
        request.range.headRef,
        "브랜치 이력을 새로 불러온 뒤 다시 선택해 주세요.",
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
            const [commit, ...parents] = line.trim().split(/\s+/u);
            return commit === undefined || commit.length === 0 || parents.length > 1
              ? []
              : [commit];
          }),
      );
      const unsupported = request.selectedCommits.find((commit) => !selectable.has(commit));
      if (unsupported !== undefined) {
        throw new RepositoryHistoryError(
          "COMMIT_NOT_SELECTABLE",
          unsupported,
          "first-parent 이력의 일반 커밋만 선택해 주세요.",
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
          "커밋 이력을 다시 불러와 주세요.",
        );
      }
      const parentIds = parents.length === 0 ? [] : parents.split(" ");
      const isMerge = parentIds.length > 1;
      return {
        id,
        shortId: id.slice(0, 7),
        parentIds,
        title,
        authorName,
        authoredAt,
        isMerge,
        selectable: !isMerge,
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
      "저장소에 있는 다른 로컬 브랜치를 선택해 주세요.",
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
      "Git을 설치하거나 실행 경로를 확인한 뒤 다시 시도해 주세요.",
      { cause: error },
    );
  }
  return new RepositoryHistoryError(
    "HISTORY_FAILED",
    subject,
    "저장소 상태를 확인한 뒤 커밋 이력을 다시 불러와 주세요.",
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
      return `Git 저장소를 열 수 없습니다: ${subject}`;
    case "GIT_UNAVAILABLE":
      return "Git 실행 파일을 사용할 수 없습니다.";
    case "BRANCH_NOT_FOUND":
      return `로컬 브랜치를 찾을 수 없습니다: ${subject}`;
    case "NO_COMMON_ANCESTOR":
      return `브랜치의 공통 이력을 찾을 수 없습니다: ${subject}`;
    case "RANGE_STALE":
      return `브랜치 이력이 변경되었습니다: ${subject}`;
    case "COMMIT_NOT_SELECTABLE":
      return `통합에 포함할 수 없는 커밋입니다: ${subject}`;
    case "HISTORY_FAILED":
      return `커밋 이력을 불러올 수 없습니다: ${subject}`;
  }
}
