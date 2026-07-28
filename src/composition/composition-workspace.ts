import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  private sparseInitialization: Promise<void> = Promise.resolve();

  constructor(private readonly git: GitCommandRunner) {}

  async withWorkspace<T>(
    repositoryPath: string,
    baseCommit: string,
    changedPaths: readonly string[],
    operation: (workspace: CompositionWorkspace) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const root = await mkdtemp(join(tmpdir(), "prettifer-composition-"));
    const path = join(root, "worktree");
    let registered = false;

    try {
      await this.git.run(["worktree", "add", "--detach", "--no-checkout", path, baseCommit], {
        cwd: repositoryPath,
        ...(signal === undefined ? {} : { signal }),
      });
      registered = true;
      await this.prepareSelectedPaths(path, changedPaths, signal);
      return await operation({ path, baseCommit });
    } finally {
      await this.cleanup(repositoryPath, root, path, registered);
    }
  }

  private async prepareSelectedPaths(
    workspacePath: string,
    changedPaths: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const options = {
      cwd: workspacePath,
      ...(signal === undefined ? {} : { signal }),
    };
    await this.git.run(["reset", "--mixed", "--quiet", "HEAD"], options);
    await this.initializeSparseCheckout(options);
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
  }

  private initializeSparseCheckout(options: {
    cwd: string;
    signal?: AbortSignal;
  }): Promise<void> {
    const initialization = this.sparseInitialization.then(async () => {
      await this.git.run(["sparse-checkout", "init", "--no-cone"], options);
    });
    this.sparseInitialization = initialization.catch(() => undefined);
    return initialization;
  }

  private async cleanup(
    repositoryPath: string,
    root: string,
    path: string,
    registered: boolean,
  ): Promise<void> {
    if (registered) {
      try {
        await this.git.run(["worktree", "remove", "--force", path], {
          cwd: repositoryPath,
        });
      } catch {
        // Direct directory removal followed by prune completes the same cleanup.
      }
    }

    let directoryError: unknown;
    try {
      await removeDirectoryWithRetries(root, {
        attempts: 3,
        delayMilliseconds: 25,
      });
    } catch (error) {
      directoryError = error;
    }

    let pruneError: unknown;
    try {
      await this.git.run(["worktree", "prune", "--expire", "now"], {
        cwd: repositoryPath,
      });
    } catch (error) {
      pruneError = error;
    }

    if (directoryError !== undefined || pruneError !== undefined) {
      throw new AggregateError(
        [directoryError, pruneError].filter((error) => error !== undefined),
        `Failed to remove the temporary workspace: ${path}`,
      );
    }
  }
}

function toSparsePattern(path: string): string {
  return `/${path.replaceAll(/([\\*?[\]])/gu, "\\$1")}`;
}

function isRetryableFileSystemError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return error.code === "EPERM" || error.code === "EBUSY" || error.code === "ENOTEMPTY";
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds === 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
