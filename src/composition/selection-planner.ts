import {
  GitCommandError,
  type GitCommandRunner,
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
          "Change the comparison range or selection, then try again.",
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
        "Check that the commit exists, then select it again.",
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
        throw new Error("The selected commit order could not be determined.");
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
          "Select commits from a single branch history.",
        );
      }
    }
  }
}

function getPosition(positions: ReadonlyMap<string, number>, commit: string): number {
  const position = positions.get(commit);
  if (position === undefined) {
    throw new Error(`The commit order could not be found: ${commit}`);
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
      return `The commit could not be found: ${commit}`;
    case "COMMIT_OUTSIDE_COMPARISON":
      return `The commit is outside the current comparison range: ${commit}`;
    case "AMBIGUOUS_SELECTION":
      return `The selected commit order is ambiguous: ${commit}`;
  }
}
