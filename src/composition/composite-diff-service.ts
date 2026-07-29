import {
  CompositionWorkspaceManager,
  type CompositionWorkspace,
} from "./composition-workspace.js";
import {
  SelectionError,
  SelectionPlanner,
  type SelectionPlan,
} from "./selection-planner.js";
import {
  gitRunOptions,
  GitCommandError,
  GitCommandRunner,
} from "../git/git-command-runner.js";

export type CompositeFileStatus = "added" | "modified" | "deleted";

interface CompositeFileChangeBase {
  readonly path: string;
}

export type CompositeFileChange =
  | Readonly<
      CompositeFileChangeBase & {
        status: "added";
        binary?: never;
        beforeContent: null;
        afterContent: string;
      }
    >
  | Readonly<
      CompositeFileChangeBase & {
        status: "modified";
        binary?: never;
        beforeContent: string;
        afterContent: string;
      }
    >
  | Readonly<
      CompositeFileChangeBase & {
        status: "deleted";
        binary?: never;
        beforeContent: string;
        afterContent: null;
      }
    >
  | Readonly<
      CompositeFileChangeBase & {
        status: CompositeFileStatus;
        binary: true;
        beforeContent: null;
        afterContent: null;
      }
    >;

interface CompositeFilePathChange {
  readonly path: string;
  readonly status: CompositeFileStatus;
}

export interface CompositeDiffResult {
  baseCommit: string;
  selectedCommits: readonly string[];
  /** Mainline parent used for each merge commit, keyed by full commit id. */
  mainlineParents: Readonly<Record<string, number>>;
  files: readonly CompositeFileChange[];
  unifiedDiff: string;
}

export interface CompositeDiffRequest {
  repositoryPath: string;
  baseRef: string;
  headRef: string;
  selectedCommits: readonly string[];
  /** Mainline parent number, keyed by selected commit. Required for merges. */
  mainlineParents?: Readonly<Record<string, number>>;
  signal?: AbortSignal;
}

const MAX_CONCURRENT_GIT_REQUESTS = 4;

export class CompositeDiffService {
  private readonly git: GitCommandRunner;
  private readonly planner: SelectionPlanner;
  private readonly workspaces: CompositionWorkspaceManager;

  constructor(git = new GitCommandRunner()) {
    this.git = git;
    this.planner = new SelectionPlanner(git);
    this.workspaces = new CompositionWorkspaceManager(git);
  }

  async compose(request: CompositeDiffRequest): Promise<CompositeDiffResult> {
    const baseCommit = await this.planner.resolveComparisonBase({
      repositoryPath: request.repositoryPath,
      baseRef: request.baseRef,
      headRef: request.headRef,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const plan = await this.planner.plan({
      repositoryPath: request.repositoryPath,
      baseCommit,
      headRef: request.headRef,
      selectedCommits: request.selectedCommits,
      ...(request.mainlineParents === undefined
        ? {}
        : { mainlineParents: request.mainlineParents }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const changedPaths = await this.findChangedPaths(
      request.repositoryPath,
      plan,
      request.signal,
    );

    return this.workspaces.withWorkspace(
      request.repositoryPath,
      baseCommit,
      changedPaths,
      (workspace) => this.composeInWorkspace(workspace, plan, request.signal),
      request.signal,
    );
  }

  /**
   * A merge is compared against its chosen mainline parent, so the prepared
   * paths match exactly what applying that merge changes.
   */
  private async findChangedPaths(
    repositoryPath: string,
    plan: SelectionPlan,
    signal: AbortSignal | undefined,
  ): Promise<string[]> {
    const changedPaths = await mapWithGitConcurrency(
      plan.selectedCommits,
      async (commit) => {
        const mainlineParent = plan.mainlineParents[commit];
        const result = await this.git.run(
          [
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "--no-renames",
            "-r",
            "-z",
            ...(mainlineParent === undefined
              ? ["--root", commit]
              : [`${commit}^${String(mainlineParent)}`, commit]),
          ],
          gitRunOptions(repositoryPath, signal),
        );
        return result.stdout.split("\0").filter((path) => path.length > 0);
      },
    );
    return [...new Set(changedPaths.flat())].sort(comparePath);
  }

  private async composeInWorkspace(
    workspace: CompositionWorkspace,
    plan: SelectionPlan,
    signal: AbortSignal | undefined,
  ): Promise<CompositeDiffResult> {
    for (const commit of plan.selectedCommits) {
      const mainlineParent = plan.mainlineParents[commit];
      try {
        await this.git.run(
          [
            "cherry-pick",
            "--no-commit",
            ...(mainlineParent === undefined
              ? []
              : ["-m", String(mainlineParent)]),
            commit,
          ],
          gitRunOptions(workspace.path, signal),
        );
      } catch (error) {
        if (!(error instanceof GitCommandError)) {
          throw error;
        }
        if (error.exitCode !== 1) {
          throw error;
        }
        const unmergedFiles = await this.git.run(
          ["ls-files", "--unmerged", "-z"],
          gitRunOptions(workspace.path, signal),
        );
        if (unmergedFiles.stdout.length === 0) {
          throw error;
        }
        throw new SelectionError(
          "COMMIT_APPLY_CONFLICT",
          commit,
          "Select its earlier prerequisite commits, then build the result again.",
          { cause: error },
        );
      }
    }

    const [unifiedDiff, nameStatus, numstat] = await Promise.all([
      this.git.run(
        [
          "diff",
          "--cached",
          "--no-renames",
          "--no-ext-diff",
          "--no-textconv",
          "--src-prefix=a/",
          "--dst-prefix=b/",
        ],
        gitRunOptions(workspace.path, signal),
      ),
      this.git.run(
        ["diff", "--cached", "--name-status", "-z", "--no-renames"],
        gitRunOptions(workspace.path, signal),
      ),
      this.git.run(
        ["diff", "--cached", "--numstat", "-z", "--no-renames"],
        gitRunOptions(workspace.path, signal),
      ),
    ]);
    const changedPaths = parseNameStatus(nameStatus.stdout).sort((left, right) =>
      comparePath(left.path, right.path),
    );
    const binaryPaths = parseBinaryPaths(numstat.stdout);
    const files = await mapWithGitConcurrency(changedPaths, (change) =>
      this.readFileChange(workspace, change, binaryPaths.has(change.path), signal),
    );

    return {
      baseCommit: workspace.baseCommit,
      selectedCommits: [...plan.selectedCommits],
      mainlineParents: plan.mainlineParents,
      files,
      unifiedDiff: unifiedDiff.stdout,
    };
  }

  private async readFileChange(
    workspace: CompositionWorkspace,
    change: CompositeFilePathChange,
    binary: boolean,
    signal: AbortSignal | undefined,
  ): Promise<CompositeFileChange> {
    if (binary) {
      return {
        ...change,
        binary: true,
        beforeContent: null,
        afterContent: null,
      };
    }
    switch (change.status) {
      case "added":
        return {
          path: change.path,
          status: "added",
          beforeContent: null,
          afterContent: (
            await this.git.run(
              ["show", `:${change.path}`],
              gitRunOptions(workspace.path, signal),
            )
          ).stdout,
        };
      case "modified": {
        const beforeContent = await this.git.run(
          ["show", `${workspace.baseCommit}:${change.path}`],
          gitRunOptions(workspace.path, signal),
        );
        const afterContent = await this.git.run(
          ["show", `:${change.path}`],
          gitRunOptions(workspace.path, signal),
        );
        return {
          path: change.path,
          status: "modified",
          beforeContent: beforeContent.stdout,
          afterContent: afterContent.stdout,
        };
      }
      case "deleted":
        return {
          path: change.path,
          status: "deleted",
          beforeContent: (
            await this.git.run(
              ["show", `${workspace.baseCommit}:${change.path}`],
              gitRunOptions(workspace.path, signal),
            )
          ).stdout,
          afterContent: null,
        };
    }
  }
}

function parseBinaryPaths(output: string): ReadonlySet<string> {
  return new Set(
    output
      .split("\0")
      .filter((record) => record.length > 0)
      .flatMap((record) => {
        const [added, deleted, path] = record.split("\t");
        return added === "-" && deleted === "-" && path !== undefined
          ? [path]
          : [];
      }),
  );
}

function parseNameStatus(
  output: string,
): CompositeFilePathChange[] {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const changes: CompositeFilePathChange[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined) {
      continue;
    }
    const tab = token.indexOf("\t");
    const statusCode = tab === -1 ? token : token.slice(0, tab);
    const path = tab === -1 ? tokens[++index] : token.slice(tab + 1);
    if (path === undefined) {
      throw new Error("The Git changed-file list could not be parsed.");
    }
    changes.push({ path, status: parseStatus(statusCode) });
  }
  return changes;
}

function parseStatus(status: string): CompositeFileStatus {
  switch (status.at(0)) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case undefined:
    default:
      throw new Error(`Unsupported file change status: ${status}`);
  }
}

function comparePath(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}


/** Runs the mapper over every item, keeping at most four Git processes alive. */
async function mapWithGitConcurrency<TItem, TResult>(
  items: readonly TItem[],
  map: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = [];
  for (
    let offset = 0;
    offset < items.length;
    offset += MAX_CONCURRENT_GIT_REQUESTS
  ) {
    const batch = items.slice(offset, offset + MAX_CONCURRENT_GIT_REQUESTS);
    results.push(...(await Promise.all(batch.map(map))));
  }
  return results;
}
