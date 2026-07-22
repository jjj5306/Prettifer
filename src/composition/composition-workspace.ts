import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GitCommandRunner } from "../git/git-command-runner.js";

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
    super(`임시 작업 공간을 정리하지 못했습니다: ${path}`, options);
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
  constructor(private readonly git: GitCommandRunner) {}

  async withWorkspace<T>(
    repositoryPath: string,
    baseCommit: string,
    operation: (workspace: CompositionWorkspace) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const root = await mkdtemp(join(tmpdir(), "prettifer-composition-"));
    const path = join(root, "worktree");
    let registered = false;

    try {
      await this.git.run(["worktree", "add", "--detach", path, baseCommit], {
        cwd: repositoryPath,
        ...(signal === undefined ? {} : { signal }),
      });
      registered = true;
      return await operation({ path, baseCommit });
    } finally {
      await this.cleanup(repositoryPath, root, path, registered);
    }
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
      await this.git.run(["worktree", "prune"], {
        cwd: repositoryPath,
      });
    } catch (error) {
      pruneError = error;
    }

    if (directoryError !== undefined || pruneError !== undefined) {
      throw new AggregateError(
        [directoryError, pruneError].filter((error) => error !== undefined),
        `임시 작업 공간 정리에 실패했습니다: ${path}`,
      );
    }
  }
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
