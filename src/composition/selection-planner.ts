import {
  GitCommandError,
  GitCommandRunner,
} from "../git/git-command-runner.js";

export interface ComparisonBaseRequest {
  repositoryPath: string;
  baseRef: string;
  headRef: string;
  signal?: AbortSignal;
}

export interface SelectionRequest {
  repositoryPath: string;
  baseCommit: string;
  headRef: string;
  selectedCommits: readonly string[];
  signal?: AbortSignal;
}

export interface SelectionPlan {
  baseCommit: string;
  selectedCommits: readonly string[];
}

export type SelectionErrorCode =
  | "INVALID_COMMIT"
  | "COMMIT_OUTSIDE_COMPARISON"
  | "AMBIGUOUS_SELECTION";

export class SelectionError extends Error {
  constructor(
    readonly code: SelectionErrorCode,
    readonly commit: string,
    readonly nextAction: string,
    options?: ErrorOptions,
  ) {
    super(createSelectionErrorMessage(code, commit), options);
    this.name = "SelectionError";
  }
}

export class SelectionPlanner {
  constructor(private readonly git: GitCommandRunner) {}

  async resolveComparisonBase(request: ComparisonBaseRequest): Promise<string> {
    const result = await this.git.run(
      ["merge-base", request.baseRef, request.headRef],
      runOptions(request.repositoryPath, request.signal),
    );
    return result.stdout.trim();
  }

  async plan(request: SelectionRequest): Promise<SelectionPlan> {
    const historyResult = await this.git.run(
      [
        "rev-list",
        "--reverse",
        "--topo-order",
        `${request.baseCommit}..${request.headRef}`,
      ],
      runOptions(request.repositoryPath, request.signal),
    );
    const history = historyResult.stdout
      .trim()
      .split("\n")
      .filter((commit) => commit.length > 0);
    const positions = new Map(history.map((commit, index) => [commit, index]));

    const resolved = await Promise.all(
      request.selectedCommits.map((commit) => this.resolveCommit(request, commit)),
    );
    const unique = [...new Set(resolved)];
    for (const commit of unique) {
      if (!positions.has(commit)) {
        throw new SelectionError(
          "COMMIT_OUTSIDE_COMPARISON",
          commit,
          "비교 기준이나 선택을 변경한 뒤 다시 계산해 주세요.",
        );
      }
    }

    unique.sort(
      (left, right) =>
        getPosition(positions, left) - getPosition(positions, right),
    );
    await this.verifyLinearAncestry(request, unique);
    return { baseCommit: request.baseCommit, selectedCommits: unique };
  }

  private async resolveCommit(
    request: SelectionRequest,
    commit: string,
  ): Promise<string> {
    try {
      const result = await this.git.run(
        ["rev-parse", "--verify", `${commit}^{commit}`],
        runOptions(request.repositoryPath, request.signal),
      );
      return result.stdout.trim();
    } catch (error) {
      if (!(error instanceof GitCommandError)) {
        throw error;
      }
      throw new SelectionError(
        "INVALID_COMMIT",
        commit,
        "커밋이 존재하는지 확인하고 다시 선택해 주세요.",
        { cause: error },
      );
    }
  }

  private async verifyLinearAncestry(
    request: SelectionRequest,
    commits: readonly string[],
  ): Promise<void> {
    for (let index = 1; index < commits.length; index += 1) {
      const ancestor = commits.at(index - 1);
      const descendant = commits.at(index);
      if (ancestor === undefined || descendant === undefined) {
        throw new Error("선택 커밋 순서를 확인할 수 없습니다.");
      }
      const result = await this.git.run(
        ["merge-base", "--is-ancestor", ancestor, descendant],
        {
          ...runOptions(request.repositoryPath, request.signal),
          acceptedExitCodes: [0, 1],
        },
      );
      if (result.exitCode === 1) {
        throw new SelectionError(
          "AMBIGUOUS_SELECTION",
          descendant,
          "하나의 브랜치 흐름에 있는 커밋만 선택해 주세요.",
        );
      }
    }
  }
}

function getPosition(positions: ReadonlyMap<string, number>, commit: string): number {
  const position = positions.get(commit);
  if (position === undefined) {
    throw new Error(`커밋 순서를 찾을 수 없습니다: ${commit}`);
  }
  return position;
}

function runOptions(
  cwd: string,
  signal: AbortSignal | undefined,
): { cwd: string; signal?: AbortSignal } {
  return signal === undefined ? { cwd } : { cwd, signal };
}

function createSelectionErrorMessage(
  code: SelectionErrorCode,
  commit: string,
): string {
  switch (code) {
    case "INVALID_COMMIT":
      return `커밋을 찾을 수 없습니다: ${commit}`;
    case "COMMIT_OUTSIDE_COMPARISON":
      return `커밋이 현재 비교 범위에 포함되지 않습니다: ${commit}`;
    case "AMBIGUOUS_SELECTION":
      return `선택 커밋의 적용 순서를 결정할 수 없습니다: ${commit}`;
  }
}
