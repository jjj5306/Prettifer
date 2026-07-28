import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { GitCommandRunner } from "../git/git-command-runner.js";

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

const CONTENT_CONFIG_PATTERN = [
  "^(core\\.",
  "(attributesfile|autocrlf|bigfilethreshold|checkroundtripencoding|eol|",
  "longpaths|safecrlf|symlinks)",
  "|merge\\.renormalize|merge\\..*\\.(driver|recursive)",
  "|filter\\..*\\.(clean|smudge|process|required))$",
].join("");
const EXTERNAL_DRIVER_PATTERN =
  /^(?:merge\..*\.driver|filter\..*\.(?:clean|smudge|process))$/u;

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
        {
          cwd: root,
          ...(signal === undefined ? {} : { signal }),
        },
      );
      await this.copyRepositoryAttributes(repositoryPath, path, signal);
      const requiresFullCheckout = await this.applyContentConfiguration(
        path,
        sourceConfiguration,
        signal,
      );
      const disabledHooksPath = join(root, "disabled-hooks");
      await mkdir(disabledHooksPath);
      await this.git.run(
        ["config", "--local", "--replace-all", "core.hooksPath", disabledHooksPath],
        {
          cwd: path,
          ...(signal === undefined ? {} : { signal }),
        },
      );
      await this.prepareSelectedPaths(
        path,
        baseCommit,
        changedPaths,
        requiresFullCheckout,
        signal,
      );
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
      {
        cwd: repositoryPath,
        acceptedExitCodes: [0, 1],
        ...(signal === undefined ? {} : { signal }),
      },
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
      {
        cwd: repositoryPath,
        acceptedExitCodes: [0, 1],
        ...(signal === undefined ? {} : { signal }),
      },
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
  ): Promise<boolean> {
    const workspaceEntries = new Map(
      (
        await this.readContentConfiguration(workspacePath, signal)
      ).map((entry) => [entry.name, entry.value]),
    );
    let requiresFullCheckout = false;
    for (const entry of sourceEntries) {
      if (workspaceEntries.get(entry.name) === entry.value) {
        continue;
      }
      await this.git.run(
        ["config", "--local", "--replace-all", entry.name, entry.value],
        {
          cwd: workspacePath,
          ...(signal === undefined ? {} : { signal }),
        },
      );
      requiresFullCheckout ||= EXTERNAL_DRIVER_PATTERN.test(entry.name);
    }
    return requiresFullCheckout;
  }

  private async copyRepositoryAttributes(
    repositoryPath: string,
    workspacePath: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const [source, target] = await Promise.all([
      this.git.run(
        ["rev-parse", "--git-path", "info/attributes"],
        {
          cwd: repositoryPath,
          ...(signal === undefined ? {} : { signal }),
        },
      ),
      this.git.run(
        ["rev-parse", "--git-path", "info/attributes"],
        {
          cwd: workspacePath,
          ...(signal === undefined ? {} : { signal }),
        },
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

  private async prepareSelectedPaths(
    workspacePath: string,
    baseCommit: string,
    changedPaths: readonly string[],
    requiresFullCheckout: boolean,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const options = {
      cwd: workspacePath,
      ...(signal === undefined ? {} : { signal }),
    };
    if (requiresFullCheckout) {
      await this.git.run(["checkout", "--quiet", "--detach", baseCommit], options);
      return;
    }
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
    await this.git.run(["checkout", "--quiet", "--detach", baseCommit], options);
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
