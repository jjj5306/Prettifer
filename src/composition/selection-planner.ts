import {
  gitRunOptions,
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
  /** Mainline parent number, keyed by selected commit. Required for merges. */
  mainlineParents?: Readonly<Record<string, number>>;
  signal?: AbortSignal;
}

export interface SelectionPlan {
  baseCommit: string;
  selectedCommits: readonly string[];
  /** Resolved mainline parent number, keyed by full commit id. Merges only. */
  mainlineParents: Readonly<Record<string, number>>;
}

export type SelectionErrorCode =
  | "INVALID_COMMIT"
  | "COMMIT_OUTSIDE_COMPARISON"
  | "AMBIGUOUS_SELECTION"
  | "COMMIT_APPLY_CONFLICT"
  | "MAINLINE_PARENT_REQUIRED"
  | "MAINLINE_PARENT_OUT_OF_RANGE";

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
      gitRunOptions(request.repositoryPath, request.signal),
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
      gitRunOptions(request.repositoryPath, request.signal),
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
    return {
      baseCommit: request.baseCommit,
      selectedCommits: unique,
      mainlineParents: await this.resolveMainlineParents(
        request,
        unique,
        requestedMainlineParents(request, resolved),
      ),
    };
  }

  /**
   * Keeps a mainline parent only for commits that actually have several parents,
   * and rejects a merge whose parent is missing or outside the parent range.
   */
  private async resolveMainlineParents(
    request: SelectionRequest,
    commits: readonly string[],
    requested: ReadonlyMap<string, number>,
  ): Promise<Readonly<Record<string, number>>> {
    const mainlineParents: Record<string, number> = {};
    for (const commit of commits) {
      const parentCount = await this.countParents(request, commit);
      if (parentCount <= 1) {
        continue;
      }
      const parent = requested.get(commit);
      if (parent === undefined) {
        throw new SelectionError(
          "MAINLINE_PARENT_REQUIRED",
          commit,
          "Choose which parent the merge should be compared against, then build the result again.",
        );
      }
      if (!Number.isInteger(parent) || parent < 1 || parent > parentCount) {
        throw new SelectionError(
          "MAINLINE_PARENT_OUT_OF_RANGE",
          commit,
          `Choose a parent between 1 and ${String(parentCount)}, then build the result again.`,
        );
      }
      mainlineParents[commit] = parent;
    }
    return mainlineParents;
  }

  private async countParents(
    request: SelectionRequest,
    commit: string,
  ): Promise<number> {
    const result = await this.git.run(
      ["rev-list", "--parents", "-n", "1", commit],
      gitRunOptions(request.repositoryPath, request.signal),
    );
    return result.stdout.trim().split(/\s+/u).length - 1;
  }

  private async resolveCommit(
    request: SelectionRequest,
    commit: string,
  ): Promise<string> {
    try {
      const result = await this.git.run(
        ["rev-parse", "--verify", `${commit}^{commit}`],
        gitRunOptions(request.repositoryPath, request.signal),
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
        gitRunOptions(request.repositoryPath, request.signal, [0, 1]),
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
    case "COMMIT_APPLY_CONFLICT":
      return `The commit cannot be applied independently: ${commit}`;
    case "MAINLINE_PARENT_REQUIRED":
      return `The merge commit needs a mainline parent: ${commit}`;
    case "MAINLINE_PARENT_OUT_OF_RANGE":
      return `The mainline parent is outside the commit's parents: ${commit}`;
  }
}

/**
 * Maps each resolved commit id to the mainline parent the caller asked for,
 * accepting either the resolved id or the original selection string as the key.
 */
function requestedMainlineParents(
  request: SelectionRequest,
  resolved: readonly string[],
): ReadonlyMap<string, number> {
  const requested = new Map<string, number>();
  if (request.mainlineParents === undefined) {
    return requested;
  }
  for (const [index, input] of request.selectedCommits.entries()) {
    const commit = resolved.at(index);
    if (commit === undefined) {
      continue;
    }
    const parent = request.mainlineParents[commit] ?? request.mainlineParents[input];
    if (parent !== undefined) {
      requested.set(commit, parent);
    }
  }
  return requested;
}
