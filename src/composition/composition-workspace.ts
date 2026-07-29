import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  gitRunOptions,
  type GitCommandRunner,
} from "../git/git-command-runner.js";

export interface CompositionWorkspace {
  path: string;
  baseCommit: string;
}

export interface DirectoryRemover {
  remove(path: string): Promise<void>;
}

export interface DirectoryRemovalOptions {
  attempts: number;
  delayMilliseconds: number;
  remover?: DirectoryRemover;
}

export class WorkspaceCleanupError extends Error {
  constructor(
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`The temporary workspace could not be removed: ${path}`, options);
    this.name = "WorkspaceCleanupError";
  }
}

const defaultDirectoryRemover: DirectoryRemover = {
  remove: (path) => rm(path, { force: true, recursive: true }),
};

interface RepositoryConfigEntry {
  readonly name: string;
  readonly value: string;
}

/** What applying the source content configuration changed in the workspace. */
interface AppliedContentConfiguration {
  /** Keys whose value the workspace did not already have. */
  readonly changedNames: readonly string[];
}

/**
 * Git configuration that changes file content or line endings on checkout. The
 * temporary workspace has to reproduce these so its files match the repository.
 * Keys are the lowercase names `git config --get-regexp` reports.
 */
const CONTENT_CONFIG_KEYS = [
  "core.attributesfile",
  "core.autocrlf",
  "core.bigfilethreshold",
  "core.checkroundtripencoding",
  "core.eol",
  "core.longpaths",
  "core.safecrlf",
  "core.symlinks",
  "merge.renormalize",
] as const;

/**
 * Content configuration that runs repository-provided code during checkout,
 * where `*` stands for the driver or filter name. Such code may read files the
 * selection does not change, so the workspace needs the whole working tree
 * instead of a sparse selection.
 */
const EXTERNAL_DRIVER_KEY_GLOBS = [
  "merge.*.driver",
  "filter.*.clean",
  "filter.*.smudge",
  "filter.*.process",
] as const;

/** Per-driver content configuration that does not run repository code. */
const INERT_DRIVER_KEY_GLOBS = [
  "merge.*.recursive",
  "filter.*.required",
] as const;

const CONTENT_CONFIG_PATTERN = toGitSearchPattern([
  ...CONTENT_CONFIG_KEYS,
  ...EXTERNAL_DRIVER_KEY_GLOBS,
  ...INERT_DRIVER_KEY_GLOBS,
]);
const CONTENT_CONFIG_MATCHER = new RegExp(CONTENT_CONFIG_PATTERN, "u");
const EXTERNAL_DRIVER_MATCHER = new RegExp(
  toGitSearchPattern(EXTERNAL_DRIVER_KEY_GLOBS),
  "u",
);

/**
 * Builds one anchored alternation that both Git and JavaScript accept, so the
 * declared key list is the only source for what the search matches. `*` stands
 * for the driver or filter name; every other character is literal.
 */
function toGitSearchPattern(keys: readonly string[]): string {
  const alternatives = keys.map((key) =>
    key
      .split("*")
      .map((literal) => literal.replaceAll(/([.\\[\]^$?+{}()|])/gu, "\\$1"))
      .join(".*"),
  );
  return `^(${alternatives.join("|")})$`;
}

/**
 * Exported so the matched configuration keys can be verified. The pattern
 * handed to `git config --get-regexp` is built from the same declaration.
 */
export function isContentConfigurationKey(name: string): boolean {
  return CONTENT_CONFIG_MATCHER.test(name);
}

/**
 * A repository-provided driver only takes effect on the keys the workspace did
 * not already have, so the decision reads the applied keys rather than every
 * key found in the source repository.
 */
function needsFullWorkingTree(applied: AppliedContentConfiguration): boolean {
  return applied.changedNames.some((name) => EXTERNAL_DRIVER_MATCHER.test(name));
}

export async function removeDirectoryWithRetries(
  path: string,
  options: DirectoryRemovalOptions,
): Promise<void> {
  const remover = options.remover ?? defaultDirectoryRemover;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      await remover.remove(path);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableFileSystemError(error) || attempt === options.attempts) {
        break;
      }
      await delay(options.delayMilliseconds * attempt);
    }
  }

  throw new WorkspaceCleanupError(path, { cause: lastError });
}

export class CompositionWorkspaceManager {
  constructor(private readonly git: GitCommandRunner) {}

  async withWorkspace<T>(
    repositoryPath: string,
    baseCommit: string,
    changedPaths: readonly string[],
    operation: (workspace: CompositionWorkspace) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const sourceConfiguration = await this.readContentConfiguration(
      repositoryPath,
      signal,
    );
    const root = await mkdtemp(join(tmpdir(), "prettifer-composition-"));
    const path = join(root, "repository");

    try {
      await this.git.run(
        [
          "clone",
          "--quiet",
          "--no-checkout",
          "--local",
          "--no-tags",
          "--",
          repositoryPath,
          path,
        ],
        gitRunOptions(root, signal),
      );
      await this.copyRepositoryAttributes(repositoryPath, path, signal);
      const appliedConfiguration = await this.applyContentConfiguration(
        path,
        sourceConfiguration,
        signal,
      );
      const disabledHooksPath = join(root, "disabled-hooks");
      await mkdir(disabledHooksPath);
      await this.git.run(
        ["config", "--local", "--replace-all", "core.hooksPath", disabledHooksPath],
        gitRunOptions(path, signal),
      );
      if (needsFullWorkingTree(appliedConfiguration)) {
        await this.checkoutFullWorkingTree(path, baseCommit, signal);
      } else {
        await this.checkoutSelectedPaths(path, baseCommit, changedPaths, signal);
      }
      return await operation({ path, baseCommit });
    } finally {
      await removeDirectoryWithRetries(root, {
        attempts: 3,
        delayMilliseconds: 25,
      });
    }
  }

  private async readContentConfiguration(
    repositoryPath: string,
    signal: AbortSignal | undefined,
  ): Promise<readonly RepositoryConfigEntry[]> {
    const result = await this.git.run(
      ["config", "--includes", "--null", "--get-regexp", CONTENT_CONFIG_PATTERN],
      gitRunOptions(repositoryPath, signal, [0, 1]),
    );
    const entries = result.stdout
      .split("\0")
      .filter((record) => record.length > 0)
      .map((record) => {
        const separator = record.indexOf("\n");
        if (separator < 0) {
          throw new Error("The repository Git configuration could not be parsed.");
        }
        return {
          name: record.slice(0, separator),
          value: record.slice(separator + 1),
        };
      });
    const attributesFile = await this.git.run(
      [
        "config",
        "--includes",
        "--null",
        "--path",
        "--get",
        "core.attributesFile",
      ],
      gitRunOptions(repositoryPath, signal, [0, 1]),
    );
    if (attributesFile.exitCode === 0) {
      const [configuredPath] = attributesFile.stdout.split("\0");
      if (configuredPath === undefined) {
        throw new Error("The repository attributes file path could not be parsed.");
      }
      entries.push({
        name: "core.attributesfile",
        value: configuredPath.length === 0
          ? configuredPath
          : resolve(repositoryPath, configuredPath),
      });
    }
    return [...new Map(entries.map((entry) => [entry.name, entry])).values()];
  }

  private async applyContentConfiguration(
    workspacePath: string,
    sourceEntries: readonly RepositoryConfigEntry[],
    signal: AbortSignal | undefined,
  ): Promise<AppliedContentConfiguration> {
    const workspaceEntries = new Map(
      (
        await this.readContentConfiguration(workspacePath, signal)
      ).map((entry) => [entry.name, entry.value]),
    );
    const changedNames: string[] = [];
    for (const entry of sourceEntries) {
      if (workspaceEntries.get(entry.name) === entry.value) {
        continue;
      }
      await this.git.run(
        ["config", "--local", "--replace-all", entry.name, entry.value],
        gitRunOptions(workspacePath, signal),
      );
      changedNames.push(entry.name);
    }
    return { changedNames };
  }

  private async copyRepositoryAttributes(
    repositoryPath: string,
    workspacePath: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const [source, target] = await Promise.all([
      this.git.run(
        ["rev-parse", "--git-path", "info/attributes"],
        gitRunOptions(repositoryPath, signal),
      ),
      this.git.run(
        ["rev-parse", "--git-path", "info/attributes"],
        gitRunOptions(workspacePath, signal),
      ),
    ]);
    const sourcePath = resolve(repositoryPath, source.stdout.trimEnd());
    const targetPath = resolve(workspacePath, target.stdout.trimEnd());
    try {
      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    } catch (error) {
      if (!isFileSystemError(error, "ENOENT")) {
        throw error;
      }
    }
  }

  /** Materializes every path of the comparison base in the working tree. */
  private async checkoutFullWorkingTree(
    workspacePath: string,
    baseCommit: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    await this.checkoutBase(workspacePath, baseCommit, signal);
  }

  /**
   * Materializes only the paths the selected commits change, so a large
   * repository does not pay for its whole working tree.
   */
  private async checkoutSelectedPaths(
    workspacePath: string,
    baseCommit: string,
    changedPaths: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const options = gitRunOptions(workspacePath, signal);
    await this.git.run(["sparse-checkout", "init", "--no-cone"], options);
    await this.git.run(
      [
        "sparse-checkout",
        "set",
        "--no-cone",
        ...(changedPaths.length === 0
          ? ["/.prettifer-empty-selection"]
          : changedPaths.map(toSparsePattern)),
      ],
      options,
    );
    await this.checkoutBase(workspacePath, baseCommit, signal);
  }

  private async checkoutBase(
    workspacePath: string,
    baseCommit: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    await this.git.run(
      ["checkout", "--quiet", "--detach", baseCommit],
      gitRunOptions(workspacePath, signal),
    );
  }
}

function toSparsePattern(path: string): string {
  return `/${path.replaceAll(/([\\*?[\]])/gu, "\\$1")}`;
}

function isRetryableFileSystemError(error: unknown): boolean {
  return (
    isFileSystemError(error, "EPERM") ||
    isFileSystemError(error, "EBUSY") ||
    isFileSystemError(error, "ENOTEMPTY")
  );
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds === 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
