import { resolve } from "node:path";

import {
  gitRunOptions,
  GitCommandRunner,
} from "../git/git-command-runner.js";

export type FileHistoryStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileHistoryEntry {
  readonly id: string;
  readonly shortId: string;
  readonly parents: readonly string[];
  readonly title: string;
  readonly authorName: string;
  readonly authoredAt: string;
  readonly status: FileHistoryStatus;
  readonly path: string;
  readonly previousPath?: string;
  readonly similarity?: number;
}

export interface FileHistoryPage {
  readonly rangeRevision: string;
  readonly path: string;
  /** Newest first; the renderer reverses all loaded pages for the timeline. */
  readonly entries: readonly FileHistoryEntry[];
  readonly nextOffset: number | null;
  readonly partial: Readonly<{
    reason: "shallow";
    message: string;
    nextAction: string;
  }> | null;
}

interface FileChangePath {
  readonly status: FileHistoryStatus;
  readonly path: string;
  readonly previousPath?: string;
  readonly similarity?: number;
}

export type FileCommitChange = Readonly<{
  commitId: string;
  parentCommit: string | null;
  parentNumber: number | null;
  path: string;
  status: FileHistoryStatus;
  beforeSize: number | null;
  afterSize: number | null;
  binary: boolean;
  beforeContent: string | null;
  afterContent: string | null;
  previousPath?: string;
  similarity?: number;
}>;

export type FileHistoryErrorCode =
  | "FILE_HISTORY_FAILED"
  | "FILE_CHANGE_NOT_FOUND"
  | "MAINLINE_PARENT_REQUIRED"
  | "MAINLINE_PARENT_OUT_OF_RANGE";

export class FileHistoryError extends Error {
  constructor(
    readonly code: FileHistoryErrorCode,
    readonly subject: string,
    readonly nextAction: string,
    options?: ErrorOptions,
  ) {
    super(fileHistoryMessage(code, subject), options);
    this.name = "FileHistoryError";
  }
}

export class FileHistoryService {
  constructor(private readonly git = new GitCommandRunner()) {}

  async list(request: {
    readonly repositoryPath: string;
    readonly headCommit: string;
    readonly rangeRevision: string;
    readonly path: string;
    readonly offset?: number;
    readonly limit?: number;
    readonly mainlineParents?: Readonly<Record<string, number>>;
    readonly signal?: AbortSignal;
  }): Promise<FileHistoryPage> {
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 100;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new FileHistoryError(
        "FILE_HISTORY_FAILED",
        request.path,
        "Reload the file history from its first page.",
      );
    }
    const repositoryPath = resolve(request.repositoryPath);
    try {
      const fetchCount = offset + limit + 1;
      const [history, shallow] = await Promise.all([
        this.git.run(
          [
            "log",
            "--follow",
            "--name-status",
            "-z",
            "--find-renames=50%",
            "-l1000",
            `--max-count=${String(fetchCount)}`,
            "--format=%x1e%H%x00%P%x00%s%x00%an%x00%aI%x00",
            request.headCommit,
            "--",
            request.path,
          ],
          gitRunOptions(repositoryPath, request.signal),
        ),
        this.git.run(
          ["rev-parse", "--is-shallow-repository"],
          gitRunOptions(repositoryPath, request.signal),
        ),
      ]);
      const followed = parseHistory(history.stdout);
      const lineagePaths = [...new Set([
        request.path,
        ...followed.flatMap((entry) => entry.previousPath === undefined
          ? [entry.path]
          : [entry.path, entry.previousPath]),
      ])];
      const mergeHistory = await this.git.run(
        [
          "log",
          "--merges",
          "--full-history",
          "--diff-merges=first-parent",
          "--name-status",
          "-z",
          "--find-renames=50%",
          "-l1000",
          `--max-count=${String(fetchCount)}`,
          "--format=%x1e%H%x00%P%x00%s%x00%an%x00%aI%x00",
          request.headCommit,
          "--",
          ...lineagePaths,
        ],
        gitRunOptions(repositoryPath, request.signal),
      );
      const selectedMainlineEntries = await Promise.all(
        Object.entries(request.mainlineParents ?? {}).map(async ([commitId, parentNumber]) =>
          this.readReachableMainlineEntry(
            repositoryPath,
            request.headCommit,
            commitId,
            parentNumber,
            new Set(lineagePaths),
            request.signal,
          )),
      );
      const parsed = uniqueHistoryEntries([
        ...followed,
        ...parseHistory(mergeHistory.stdout, true),
        ...selectedMainlineEntries.filter((entry): entry is FileHistoryEntry => entry !== null),
      ]);
      const creationIndex = parsed.findIndex((entry) => entry.status === "added");
      const lineage = creationIndex < 0 ? parsed : parsed.slice(0, creationIndex + 1);
      const page = lineage.slice(offset, offset + limit);
      const hasNextPage = creationIndex < 0 && lineage.length > offset + limit;
      return {
        rangeRevision: request.rangeRevision,
        path: request.path,
        entries: page,
        nextOffset: hasNextPage ? offset + limit : null,
        partial: shallow.stdout.trim() === "true"
          ? {
              reason: "shallow",
              message: "Only the file history available in this shallow clone is shown.",
              nextAction: "Fetch the required Git history, then reload File History.",
            }
          : null,
      };
    } catch (error) {
      if (error instanceof FileHistoryError) {
        throw error;
      }
      throw new FileHistoryError(
        "FILE_HISTORY_FAILED",
        request.path,
        "Check the repository history, then reload File History.",
        { cause: error },
      );
    }
  }

  private async readReachableMainlineEntry(
    repositoryPath: string,
    headCommit: string,
    commitId: string,
    parentNumber: number,
    lineagePaths: ReadonlySet<string>,
    signal: AbortSignal | undefined,
  ): Promise<FileHistoryEntry | null> {
    const reachable = await this.git.run(
      ["merge-base", "--is-ancestor", commitId, headCommit],
      gitRunOptions(repositoryPath, signal, [0, 1]),
    );
    if (reachable.exitCode !== 0) {
      return null;
    }
    const parentOutput = await this.git.run(
      ["rev-list", "--parents", "-n1", commitId],
      gitRunOptions(repositoryPath, signal),
    );
    const [, ...parents] = parentOutput.stdout.trim().split(/\s+/u);
    const parentCommit = parents[parentNumber - 1];
    if (parents.length < 2 || parentCommit === undefined) {
      return null;
    }
    const changes = await this.readChangedPaths(repositoryPath, parentCommit, commitId, signal);
    const change = changes.find((candidate) =>
      lineagePaths.has(candidate.path) ||
      (candidate.previousPath !== undefined && lineagePaths.has(candidate.previousPath)),
    );
    if (change === undefined) {
      return null;
    }
    const metadata = await this.git.run(
      ["show", "-s", "--format=%H%x00%P%x00%s%x00%an%x00%aI", commitId],
      gitRunOptions(repositoryPath, signal),
    );
    const [id = "", parentIds = "", title = "", authorName = "", authoredAt = ""] =
      metadata.stdout.trim().split("\0");
    if (id.length === 0 || authoredAt.length === 0) {
      throw new FileHistoryError("FILE_HISTORY_FAILED", commitId, "Reload File History.");
    }
    return {
      id,
      shortId: id.slice(0, 7),
      parents: parentIds.split(" ").filter((parent) => parent.length > 0),
      title,
      authorName,
      authoredAt,
      ...change,
    };
  }

  async readCommit(request: {
    readonly repositoryPath: string;
    readonly commitId: string;
    readonly path: string;
    readonly mainlineParent?: number;
    readonly requireMainline?: boolean;
    readonly signal?: AbortSignal;
  }): Promise<FileCommitChange> {
    const repositoryPath = resolve(request.repositoryPath);
    try {
      const parentOutput = await this.git.run(
        ["rev-list", "--parents", "-n1", request.commitId],
        gitRunOptions(repositoryPath, request.signal),
      );
      const [, ...parents] = parentOutput.stdout.trim().split(/\s+/u);
      if (parents.length > 1 && request.requireMainline === true && request.mainlineParent === undefined) {
        throw new FileHistoryError(
          "MAINLINE_PARENT_REQUIRED",
          request.commitId,
          "Choose the merge mainline parent in Commit History, then open this change again.",
        );
      }
      const parentNumber = parents.length === 0 ? null : request.mainlineParent ?? 1;
      if (parentNumber !== null && (parentNumber < 1 || parentNumber > parents.length)) {
        throw new FileHistoryError(
          "MAINLINE_PARENT_OUT_OF_RANGE",
          request.commitId,
          "Choose one of the merge commit parents shown in Commit History.",
        );
      }
      const parentCommit = parentNumber === null ? null : parents[parentNumber - 1] ?? null;
      const paths = await this.readChangedPaths(
        repositoryPath,
        parentCommit,
        request.commitId,
        request.signal,
      );
      const change = paths.find((candidate) =>
        candidate.path === request.path || candidate.previousPath === request.path,
      );
      if (change === undefined) {
        throw new FileHistoryError(
          "FILE_CHANGE_NOT_FOUND",
          `${request.commitId}:${request.path}`,
          "Reload File History and choose the file path shown for this commit.",
        );
      }
      return await this.readContents(
        repositoryPath,
        request.commitId,
        parentCommit,
        parentNumber,
        change,
        request.signal,
      );
    } catch (error) {
      if (error instanceof FileHistoryError) {
        throw error;
      }
      throw new FileHistoryError(
        "FILE_HISTORY_FAILED",
        `${request.commitId}:${request.path}`,
        "Check the repository history, then open this file change again.",
        { cause: error },
      );
    }
  }

  private async readChangedPaths(
    repositoryPath: string,
    parentCommit: string | null,
    commitId: string,
    signal: AbortSignal | undefined,
  ): Promise<readonly FileChangePath[]> {
    const args = parentCommit === null
      ? [
          "diff-tree", "--root", "--no-commit-id", "-r", "-z",
          "--name-status", "--find-renames=50%", "-l1000", commitId,
        ]
      : [
          "diff", "--name-status", "-z", "--find-renames=50%", "-l1000",
          parentCommit, commitId,
        ];
    const output = await this.git.run(args, gitRunOptions(repositoryPath, signal));
    return parseNameStatus(output.stdout);
  }

  private async readContents(
    repositoryPath: string,
    commitId: string,
    parentCommit: string | null,
    parentNumber: number | null,
    change: FileChangePath,
    signal: AbortSignal | undefined,
  ): Promise<FileCommitChange> {
    const beforePath = change.previousPath ?? change.path;
    const beforeSpec = parentCommit === null || change.status === "added"
      ? null
      : `${parentCommit}:${beforePath}`;
    const afterSpec = change.status === "deleted" ? null : `${commitId}:${change.path}`;
    const [beforeSize, afterSize, binary] = await Promise.all([
      this.readBlobSize(repositoryPath, beforeSpec, signal),
      this.readBlobSize(repositoryPath, afterSpec, signal),
      this.isBinary(repositoryPath, parentCommit, commitId, beforePath, change.path, signal),
    ]);
    const base = {
      commitId,
      parentCommit,
      parentNumber,
      path: change.path,
      status: change.status,
      beforeSize,
      afterSize,
      binary,
      ...(change.previousPath === undefined ? {} : { previousPath: change.previousPath }),
      ...(change.similarity === undefined ? {} : { similarity: change.similarity }),
    };
    if (binary) {
      return { ...base, beforeContent: null, afterContent: null };
    }
    const [beforeContent, afterContent] = await Promise.all([
      this.readBlob(repositoryPath, beforeSpec, signal),
      this.readBlob(repositoryPath, afterSpec, signal),
    ]);
    return { ...base, beforeContent, afterContent };
  }

  private async readBlobSize(
    repositoryPath: string,
    spec: string | null,
    signal: AbortSignal | undefined,
  ): Promise<number | null> {
    if (spec === null) {
      return null;
    }
    const output = await this.git.run(
      ["cat-file", "-s", spec],
      gitRunOptions(repositoryPath, signal),
    );
    return Number(output.stdout.trim());
  }

  private async readBlob(
    repositoryPath: string,
    spec: string | null,
    signal: AbortSignal | undefined,
  ): Promise<string | null> {
    if (spec === null) {
      return null;
    }
    return (await this.git.run(["show", spec], gitRunOptions(repositoryPath, signal))).stdout;
  }

  private async isBinary(
    repositoryPath: string,
    parentCommit: string | null,
    commitId: string,
    beforePath: string,
    afterPath: string,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    const args = parentCommit === null
      ? ["show", "--numstat", "--format=", "-z", commitId, "--", afterPath]
      : ["diff", "--numstat", "-z", parentCommit, commitId, "--", beforePath, afterPath];
    const output = await this.git.run(args, gitRunOptions(repositoryPath, signal));
    return output.stdout.split("\0").some((record) => record.startsWith("-\t-\t"));
  }
}

function uniqueHistoryEntries(entries: readonly FileHistoryEntry[]): FileHistoryEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .sort((left, right) => right.authoredAt.localeCompare(left.authoredAt))
    .filter((entry) => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    });
}

function parseHistory(output: string, allowUnchangedCommits = false): FileHistoryEntry[] {
  const entries = output
    .split("\x1e")
    .map((record) => record.replace(/^\r?\n/u, ""))
    .filter((record) => record.length > 0)
    .map<FileHistoryEntry | null>((record) => {
      const tokens = record.split("\0");
      const [id = "", parents = "", title = "", authorName = "", authoredAt = ""] = tokens;
      const statusIndex = tokens.findIndex((token, index) =>
        index >= 5 && /^[AMDRT][0-9]*$/u.test(token.trim()),
      );
      if (id.length === 0) {
        throw new FileHistoryError(
          "FILE_HISTORY_FAILED",
          "git-log-output",
          "Reload File History.",
        );
      }
      if (statusIndex < 0) {
        if (allowUnchangedCommits) {
          return null;
        }
        throw new FileHistoryError(
          "FILE_HISTORY_FAILED",
          "git-log-output",
          "Reload File History.",
        );
      }
      const change = parseStatusTokens(tokens, statusIndex);
      return {
        id,
        shortId: id.slice(0, 7),
        parents: parents.length === 0 ? [] : parents.split(" "),
        title,
        authorName,
        authoredAt,
        ...change,
      };
    });
  return entries.filter((entry): entry is FileHistoryEntry => entry !== null);
}

function parseNameStatus(output: string): FileChangePath[] {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const changes: FileChangePath[] = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index];
    if (status === undefined) {
      break;
    }
    const parsed = parseStatusTokens(tokens, index);
    changes.push(parsed);
    index += parsed.status === "renamed" ? 3 : 2;
  }
  return changes;
}

function parseStatusTokens(tokens: readonly string[], statusIndex: number): FileChangePath {
  const code = (tokens[statusIndex] ?? "").trim();
  const kind = code.at(0);
  if (kind === "R") {
    const previousPath = tokens[statusIndex + 1];
    const path = tokens[statusIndex + 2];
    const similarity = Number(code.slice(1));
    if (previousPath === undefined || path === undefined || !Number.isInteger(similarity)) {
      throw malformedStatus();
    }
    return { status: "renamed", previousPath, path, similarity };
  }
  const path = tokens[statusIndex + 1];
  if (path === undefined) {
    throw malformedStatus();
  }
  switch (kind) {
    case "A": return { status: "added", path };
    case "D": return { status: "deleted", path };
    case "M":
    case "T": return { status: "modified", path };
    case undefined: throw malformedStatus();
    default: throw malformedStatus();
  }
}

function malformedStatus(): FileHistoryError {
  return new FileHistoryError(
    "FILE_HISTORY_FAILED",
    "git-name-status",
    "Reload File History.",
  );
}

function fileHistoryMessage(code: FileHistoryErrorCode, subject: string): string {
  switch (code) {
    case "FILE_CHANGE_NOT_FOUND": return `The file change was not found: ${subject}`;
    case "MAINLINE_PARENT_REQUIRED": return `A mainline parent is required: ${subject}`;
    case "MAINLINE_PARENT_OUT_OF_RANGE": return `The mainline parent is invalid: ${subject}`;
    case "FILE_HISTORY_FAILED": return `The file history could not be loaded: ${subject}`;
  }
}
