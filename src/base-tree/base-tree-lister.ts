import {
  gitRunOptions,
  GitCommandError,
  type GitCommandRunner,
} from "../git/git-command-runner.js";

export interface BaseTreeListing {
  /** Repository-relative paths tracked at the commit, in Git's order. */
  readonly paths: readonly string[];
  /** True when the limit cut the list, so the screen can say so. */
  readonly truncated: boolean;
}

export class BaseTreeError extends Error {
  readonly code = "BASE_TREE_LIST_FAILED";
  readonly subject = "Repository tree";
  readonly nextAction = "Reload the comparison range, then open Full Tree again.";

  constructor(options?: ErrorOptions) {
    super("The repository file list could not be read.", options);
    this.name = "BaseTreeError";
  }
}

/**
 * A tree of the whole repository stops being a useful screen long before this,
 * and without a limit nobody knows where the view gives up.
 */
const DEFAULT_LIMIT = 20_000;

/**
 * Lists the paths tracked at a commit, so the review can show where a change
 * sits in the project.
 *
 * Reading a commit rather than the working tree means the user's branch, HEAD
 * and uncommitted work are never touched. It also settles what the list holds
 * without a rule of its own: a commit has no untracked or ignored files.
 */
export class BaseTreeLister {
  constructor(
    private readonly git: GitCommandRunner,
    private readonly limit: number = DEFAULT_LIMIT,
  ) {}

  async list(
    repositoryPath: string,
    commit: string,
    signal?: AbortSignal,
  ): Promise<BaseTreeListing> {
    let stdout: string;
    try {
      // -z separates with NUL, so a path holding a newline stays one record.
      const output = await this.git.run(
        ["ls-tree", "-r", "-z", "--name-only", commit],
        gitRunOptions(repositoryPath, signal),
      );
      stdout = output.stdout;
    } catch (error) {
      throw new BaseTreeError(
        error instanceof GitCommandError ? { cause: error } : { cause: error },
      );
    }

    const paths: string[] = [];
    let truncated = false;
    for (const record of stdout.split("\0")) {
      if (record.length === 0) {
        continue;
      }
      if (paths.length >= this.limit) {
        truncated = true;
        break;
      }
      paths.push(record);
    }
    return { paths, truncated };
  }
}
