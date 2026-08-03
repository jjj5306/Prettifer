import {
  gitRunOptions,
  type GitCommandRunner,
} from "../git/git-command-runner.js";

/** A file read straight from a commit, with no selection applied. */
export interface BaseFile {
  readonly path: string;
  readonly contents: string;
}

export type BaseFileErrorCode =
  | "BASE_FILE_MISSING"
  | "BASE_FILE_BINARY"
  | "BASE_FILE_TOO_LARGE"
  | "BASE_FILE_READ_FAILED";

export class BaseFileError extends Error {
  constructor(
    readonly code: BaseFileErrorCode,
    readonly subject: string,
    readonly nextAction: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BaseFileError";
  }
}

/** Monaco is not a viewer for generated files, and a review of one is not useful. */
const DEFAULT_SIZE_LIMIT = 2 * 1024 * 1024;

/**
 * Reads one file at a commit so a navigation can leave the selected result.
 *
 * A symbol is searched across the whole repository, so most declarations live in
 * files the selection never changed. Those files are not in the composed result,
 * and reading them from the commit keeps the working tree untouched, exactly as
 * the search does.
 */
export class BaseFileReader {
  constructor(
    private readonly git: GitCommandRunner,
    private readonly sizeLimit: number = DEFAULT_SIZE_LIMIT,
  ) {}

  async read(
    repositoryPath: string,
    commit: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<BaseFile> {
    assertRepositoryRelative(path);
    const object = `${commit}:${path}`;

    // A directory reads as a tree, and an unknown path fails with 128.
    const type = await this.runGit(path, ["cat-file", "-t", object], repositoryPath, signal);
    if (type.exitCode !== 0 || type.stdout.trim() !== "blob") {
      throw new BaseFileError(
        "BASE_FILE_MISSING",
        path,
        "Review the file in the selected result instead.",
        "That file is not part of the comparison base.",
      );
    }

    const size = Number(
      (await this.runGit(path, ["cat-file", "-s", object], repositoryPath, signal)).stdout.trim(),
    );
    if (!Number.isFinite(size) || size > this.sizeLimit) {
      throw new BaseFileError(
        "BASE_FILE_TOO_LARGE",
        path,
        "Open the file in an editor outside Prettifer.",
        "That file is too large to review.",
      );
    }

    const contents = (
      await this.runGit(path, ["show", object], repositoryPath, signal)
    ).stdout;
    if (contents.includes("\u0000")) {
      throw new BaseFileError(
        "BASE_FILE_BINARY",
        path,
        "Open the file in a viewer for its format.",
        "That file is binary, so it has no text to review.",
      );
    }
    return { path, contents };
  }

  /** Keeps every Git failure behind one diagnostic that names no command. */
  private async runGit(
    path: string,
    args: readonly string[],
    repositoryPath: string,
    signal: AbortSignal | undefined,
  ): Promise<{ readonly stdout: string; readonly exitCode: number }> {
    try {
      return await this.git.run(
        [...args],
        gitRunOptions(repositoryPath, signal, [0, 128]),
      );
    } catch (error) {
      throw new BaseFileError(
        "BASE_FILE_READ_FAILED",
        path,
        "Build the result again, then try the navigation again.",
        "That file could not be read from the repository.",
        { cause: error },
      );
    }
  }
}

/**
 * The path comes from a search result, so it is already repository-relative. It
 * is checked again here because this is the point where a path becomes a Git
 * object name: an absolute path or a `..` segment would reach outside the
 * repository the user opened.
 */
function assertRepositoryRelative(path: string): void {
  const segments = path.split("/");
  const escapes = path.length === 0
    || path.startsWith("/")
    || /^[A-Za-z]:/u.test(path)
    || path.includes("\\")
    || path.includes("\u0000")
    || segments.includes("..");
  if (escapes) {
    throw new BaseFileError(
      "BASE_FILE_MISSING",
      path,
      "Review a file listed in the selected result instead.",
      "That is not a path inside the repository.",
    );
  }
}
