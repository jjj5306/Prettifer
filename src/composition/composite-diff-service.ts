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

export type CompositeProblemCode = "CONTENT_CHOICE_REQUIRED";

export interface CompositeProblemFile {
  readonly path: string;
  readonly code: CompositeProblemCode;
  /** Commit whose application could not be completed for this path. */
  readonly commit: string;
  readonly nextAction: string;
}

export interface CompositeDiffResult {
  baseCommit: string;
  selectedCommits: readonly string[];
  /** Mainline parent used for each merge commit, keyed by full commit id. */
  mainlineParents: Readonly<Record<string, number>>;
  files: readonly CompositeFileChange[];
  /** Paths that needed a content choice. A non-empty list means a partial result. */
  problemFiles: readonly CompositeProblemFile[];
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
    const problemFiles = new Map<string, CompositeProblemFile>();
    let firstConflictingCommit: string | undefined;
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
        const conflicts = await this.readConflicts(workspace, signal);
        if (conflicts.size === 0) {
          throw error;
        }
        await this.isolateConflicts(workspace, conflicts, commit, error, signal);
        firstConflictingCommit ??= commit;
        for (const path of conflicts.keys()) {
          // The earliest conflict names the earliest missing prerequisite, which
          // is the one the user has to select first.
          if (problemFiles.has(path)) {
            continue;
          }
          problemFiles.set(path, {
            path,
            code: "CONTENT_CHOICE_REQUIRED",
            commit,
            nextAction:
              "Select the prerequisite commits that changed this file, then build the result again.",
          });
        }
      }
    }
    // Problem paths are restored to the base so the file list and the unified
    // diff never present content that matches no selection.
    await this.restoreToBase(workspace, [...problemFiles.keys()], signal);

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
    if (files.length === 0 && problemFiles.size > 0) {
      // Nothing survived the conflicts, so there is no result worth reviewing.
      throw new SelectionError(
        "COMMIT_APPLY_CONFLICT",
        firstConflictingCommit ?? plan.selectedCommits[0] ?? "",
        "Select its earlier prerequisite commits, then build the result again.",
      );
    }

    return {
      baseCommit: workspace.baseCommit,
      selectedCommits: [...plan.selectedCommits],
      mainlineParents: plan.mainlineParents,
      files,
      problemFiles: [...problemFiles.values()].sort((left, right) =>
        comparePath(left.path, right.path),
      ),
      unifiedDiff: unifiedDiff.stdout,
    };
  }

  /** Conflicted paths mapped to the index stages Git left behind. */
  private async readConflicts(
    workspace: CompositionWorkspace,
    signal: AbortSignal | undefined,
  ): Promise<Map<string, Set<number>>> {
    const unmerged = await this.git.run(
      ["ls-files", "--unmerged", "-z"],
      gitRunOptions(workspace.path, signal),
    );
    const conflicts = new Map<string, Set<number>>();
    for (const record of unmerged.stdout.split("\0")) {
      if (record.length === 0) {
        continue;
      }
      const [details, path] = record.split("\t");
      const stage = Number(details?.trim().split(/\s+/u).at(2));
      if (path === undefined || !Number.isInteger(stage)) {
        throw new Error("The conflicted index entries could not be parsed.");
      }
      const stages = conflicts.get(path) ?? new Set<number>();
      stages.add(stage);
      conflicts.set(path, stages);
    }
    return conflicts;
  }

  /**
   * Restores each conflicted path to the state it had before the commit was
   * applied and clears the sequencer, so the remaining commits can still apply.
   */
  private async isolateConflicts(
    workspace: CompositionWorkspace,
    conflicts: ReadonlyMap<string, Set<number>>,
    commit: string,
    cause: GitCommandError,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    for (const [path, stages] of conflicts) {
      if (stages.has(2)) {
        // Stage 2 holds the content from before this commit was applied.
        await this.git.run(
          ["checkout", "--ours", "--", path],
          gitRunOptions(workspace.path, signal),
        );
        await this.git.run(
          ["add", "--", path],
          gitRunOptions(workspace.path, signal),
        );
        continue;
      }
      await this.git.run(
        ["rm", "--force", "--quiet", "--", path],
        gitRunOptions(workspace.path, signal),
      );
    }
    if ((await this.readConflicts(workspace, signal)).size > 0) {
      throw new SelectionError(
        "COMMIT_APPLY_CONFLICT",
        commit,
        "Select its earlier prerequisite commits, then build the result again.",
        { cause },
      );
    }
    await this.git.run(
      ["cherry-pick", "--quit"],
      gitRunOptions(workspace.path, signal),
    );
  }

  /** Returns the given paths to their comparison base state. */
  private async restoreToBase(
    workspace: CompositionWorkspace,
    paths: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    for (const path of paths) {
      const existsInBase = await this.git.run(
        ["cat-file", "-e", `${workspace.baseCommit}:${path}`],
        gitRunOptions(workspace.path, signal, [0, 1, 128]),
      );
      if (existsInBase.exitCode === 0) {
        await this.git.run(
          ["checkout", workspace.baseCommit, "--", path],
          gitRunOptions(workspace.path, signal),
        );
        continue;
      }
      await this.git.run(
        ["rm", "--force", "--quiet", "--ignore-unmatch", "--", path],
        gitRunOptions(workspace.path, signal),
      );
    }
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
