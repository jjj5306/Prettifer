import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CompositionWorkspaceManager,
  type CompositionWorkspace,
} from "./composition-workspace.js";
import { SelectionPlanner } from "./selection-planner.js";
import { GitCommandRunner } from "../git/git-command-runner.js";

export type CompositeFileStatus = "added" | "modified" | "deleted";

export interface CompositeFileChange {
  path: string;
  status: CompositeFileStatus;
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

    return this.workspaces.withWorkspace(
      request.repositoryPath,
      baseCommit,
      (workspace) => this.composeInWorkspace(workspace, plan.selectedCommits, request.signal),
      request.signal,
    );
  }

  private async composeInWorkspace(
    workspace: CompositionWorkspace,
    selectedCommits: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<CompositeDiffResult> {
    for (const commit of selectedCommits) {
      await this.git.run(
        ["cherry-pick", "--no-commit", commit],
        runOptions(workspace.path, signal),
      );
    }

    const unifiedDiff = await this.git.run(
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
    );
    const nameStatus = await this.git.run(
      ["diff", "--cached", "--name-status", "-z", "--no-renames"],
      runOptions(workspace.path, signal),
    );
    const changedPaths = parseNameStatus(nameStatus.stdout).sort((left, right) =>
      comparePath(left.path, right.path),
    );
    const files = await Promise.all(
      changedPaths.map((change) =>
        this.readFileChange(workspace, change, signal),
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
    signal: AbortSignal | undefined,
  ): Promise<CompositeFileChange> {
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
