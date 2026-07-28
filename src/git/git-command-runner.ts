import { spawn } from "node:child_process";

export interface ProcessRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessExecutor {
  execute(request: ProcessRequest): Promise<ProcessOutput>;
}

export interface GitRunOptions {
  cwd: string;
  signal?: AbortSignal;
  acceptedExitCodes?: readonly number[];
}

/**
 * Builds run options that omit `signal` entirely when there is none, which
 * `exactOptionalPropertyTypes` requires.
 */
export function gitRunOptions(
  cwd: string,
  signal: AbortSignal | undefined,
  acceptedExitCodes?: readonly number[],
): GitRunOptions {
  return {
    cwd,
    ...(signal === undefined ? {} : { signal }),
    ...(acceptedExitCodes === undefined ? {} : { acceptedExitCodes }),
  };
}

export interface GitCommandRunnerOptions {
  executor?: ProcessExecutor;
  gitPath?: string;
}

export class GitCommandError extends Error {
  constructor(
    readonly gitArguments: readonly string[],
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
    options?: ErrorOptions,
  ) {
    super(
      stderr.trim().length > 0
        ? stderr.trim()
        : `Git command failed with exit code ${exitCode}.`,
      options,
    );
    this.name = "GitCommandError";
  }
}

export class GitCommandAbortedError extends Error {
  constructor(options?: ErrorOptions) {
    super("The Git operation was cancelled.", options);
    this.name = "GitCommandAbortedError";
  }
}

export class NodeProcessExecutor implements ProcessExecutor {
  execute(request: ProcessRequest): Promise<ProcessOutput> {
    if (request.signal?.aborted === true) {
      return Promise.reject(new GitCommandAbortedError());
    }

    return new Promise((resolve, reject) => {
      const child = spawn(request.executable, [...request.args], {
        cwd: request.cwd,
        env: request.env,
        shell: false,
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;

      const finish = (
        callback: () => void,
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        request.signal?.removeEventListener("abort", abort);
        callback();
      };
      const abort = (): void => {
        child.kill();
        finish(() => {
          reject(new GitCommandAbortedError());
        });
      };

      request.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        finish(() => {
          reject(error);
        });
      });
      child.on("close", (exitCode) => {
        finish(() => {
          resolve({
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
            exitCode: exitCode ?? -1,
          });
        });
      });
    });
  }
}

export class GitCommandRunner {
  private readonly executor: ProcessExecutor;
  private readonly gitPath: string;

  constructor(options: GitCommandRunnerOptions = {}) {
    this.executor = options.executor ?? new NodeProcessExecutor();
    this.gitPath = options.gitPath ?? "git";
  }

  async run(
    gitArguments: readonly string[],
    options: GitRunOptions,
  ): Promise<ProcessOutput> {
    const args = [
      "--no-pager",
      "-c",
      "color.ui=false",
      "-c",
      "core.pager=cat",
      ...gitArguments,
    ];
    const request: ProcessRequest = {
      executable: this.gitPath,
      args,
      cwd: options.cwd,
      env: {
        ...process.env,
        GIT_EXTERNAL_DIFF: "",
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
      },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };

    let output: ProcessOutput;
    try {
      output = await this.executor.execute(request);
    } catch (error) {
      if (error instanceof GitCommandAbortedError || options.signal?.aborted === true) {
        throw new GitCommandAbortedError({ cause: error });
      }
      throw new GitCommandError(gitArguments, -1, "", String(error), {
        cause: error,
      });
    }

    const acceptedExitCodes = options.acceptedExitCodes ?? [0];
    if (!acceptedExitCodes.includes(output.exitCode)) {
      throw new GitCommandError(
        gitArguments,
        output.exitCode,
        output.stdout,
        output.stderr,
      );
    }
    return output;
  }
}
