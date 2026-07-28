import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CompositionWorkspaceManager,
  type CompositionWorkspace,
} from "./composition-workspace.js";
import { SelectionError, SelectionPlanner } from "./selection-planner.js";
import {
  GitCommandError,
  GitCommandRunner,
} from "../git/git-command-runner.js";

export type CompositeFileStatus = "added" | "modified" | "deleted";

export interface CompositeFileChange {
  path: string;
  status: CompositeFileStatus;
  binary?: true;
  beforeContent: string | null;
  afterContent: string | null;
}

export interface CompositeDiffResult {
  baseCommit: string;
  selectedCommits: readonly string[];
  files: readonly CompositeFileChange[];
  unifiedDiff: string;
}

export interface CompositeDiffRequest {
  repositoryPath: string;
  baseRef: string;
  headRef: string;
  selectedCommits: readonly string[];
  signal?: AbortSignal;
}

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
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const changedPaths = await this.findChangedPaths(
      request.repositoryPath,
      plan.selectedCommits,
      request.signal,
    );

    return this.workspaces.withWorkspace(
      request.repositoryPath,
      baseCommit,
      changedPaths,
      (workspace) => this.composeInWorkspace(workspace, plan.selectedCommits, request.signal),
      request.signal,
    );
  }

  private async findChangedPaths(
    repositoryPath: string,
    selectedCommits: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<string[]> {
    const results = await Promise.all(
      selectedCommits.map((commit) =>
        this.git.run(
          [
            "diff-tree",
            "--no-commit-id",
            "--name-only",
            "--no-renames",
            "-r",
            "-z",
            "--root",
            commit,
          ],
          runOptions(repositoryPath, signal),
        ),
      ),
    );
    return [...new Set(
      results.flatMap((result) =>
        result.stdout.split("\0").filter((path) => path.length > 0),
      ),
    )].sort(comparePath);
  }

  private async composeInWorkspace(
    workspace: CompositionWorkspace,
    selectedCommits: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<CompositeDiffResult> {
    for (const commit of selectedCommits) {
      try {
        await this.git.run(
          ["cherry-pick", "--no-commit", commit],
          runOptions(workspace.path, signal),
        );
      } catch (error) {
        if (!(error instanceof GitCommandError)) {
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
        runOptions(workspace.path, signal),
      ),
      this.git.run(
        ["diff", "--cached", "--name-status", "-z", "--no-renames"],
        runOptions(workspace.path, signal),
      ),
      this.git.run(
        ["diff", "--cached", "--numstat", "-z", "--no-renames"],
        runOptions(workspace.path, signal),
      ),
    ]);
    const changedPaths = parseNameStatus(nameStatus.stdout).sort((left, right) =>
      comparePath(left.path, right.path),
    );
    const binaryPaths = parseBinaryPaths(numstat.stdout);
    const files = await Promise.all(
      changedPaths.map((change) =>
        this.readFileChange(workspace, change, binaryPaths.has(change.path), signal),
      ),
    );

    return {
      baseCommit: workspace.baseCommit,
      selectedCommits: [...selectedCommits],
      files,
      unifiedDiff: unifiedDiff.stdout,
    };
  }

  private async readFileChange(
    workspace: CompositionWorkspace,
    change: Pick<CompositeFileChange, "path" | "status">,
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
    const beforeContent =
      change.status === "added"
        ? null
        : (
            await this.git.run(
              ["show", `${workspace.baseCommit}:${change.path}`],
              runOptions(workspace.path, signal),
            )
          ).stdout;
    const afterContent =
      change.status === "deleted"
        ? null
        : await readFile(join(workspace.path, change.path), "utf8");

    return { ...change, beforeContent, afterContent };
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
): Pick<CompositeFileChange, "path" | "status">[] {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const changes: Pick<CompositeFileChange, "path" | "status">[] = [];

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

function runOptions(
  cwd: string,
  signal: AbortSignal | undefined,
): { cwd: string; signal?: AbortSignal } {
  return signal === undefined ? { cwd } : { cwd, signal };
}
