import { describe, expect, it, vi } from "vitest";

import {
  GitCommandAbortedError,
  GitCommandError,
  GitCommandRunner,
  NodeProcessExecutor,
  type ProcessExecutor,
  type ProcessRequest,
} from "../../src/git/git-command-runner.js";

describe("GitCommandRunner", () => {
  it("passes arguments without shell interpolation and fixes non-interactive settings", async () => {
    const execute = vi.fn<(request: ProcessRequest) => Promise<{ stdout: string; stderr: string; exitCode: number }>>()
      .mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 });
    const executor: ProcessExecutor = { execute };
    const runner = new GitCommandRunner({ executor, gitPath: "custom-git" });

    await expect(
      runner.run(["show", "feature name:file with space.ts"], {
        cwd: "C:\\repo with space",
      }),
    ).resolves.toMatchObject({ stdout: "ok" });

    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]![0]).toMatchObject({
      executable: "custom-git",
      cwd: "C:\\repo with space",
      args: [
        "--no-pager",
        "-c",
        "color.ui=false",
        "-c",
        "core.pager=cat",
        "show",
        "feature name:file with space.ts",
      ],
      env: expect.objectContaining({
        GIT_EXTERNAL_DIFF: "",
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
      }),
    });
  });

  it("preserves exit code, standard error, and arguments on failure", async () => {
    const executor: ProcessExecutor = {
      execute: () =>
        Promise.resolve({
          stdout: "partial",
          stderr: "fatal: unknown revision",
          exitCode: 128,
        }),
    };
    const runner = new GitCommandRunner({ executor });

    await expect(runner.run(["show", "missing"], { cwd: "C:\\repo" })).rejects.toEqual(
      expect.objectContaining<Partial<GitCommandError>>({
        exitCode: 128,
        stderr: "fatal: unknown revision",
        gitArguments: ["show", "missing"],
      }),
    );
  });

  it("propagates cancellation as a dedicated error", async () => {
    const controller = new AbortController();
    const executor: ProcessExecutor = {
      execute(request) {
        controller.abort();
        request.signal?.throwIfAborted();
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
      },
    };
    const runner = new GitCommandRunner({ executor });

    await expect(
      runner.run(["status"], { cwd: "C:\\repo", signal: controller.signal }),
    ).rejects.toBeInstanceOf(GitCommandAbortedError);
  });
});

describe("NodeProcessExecutor", () => {
  it("terminates an active process when cancelled", async () => {
    const controller = new AbortController();
    const executor = new NodeProcessExecutor();
    const execution = executor.execute({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10000)"],
      cwd: process.cwd(),
      env: process.env,
      signal: controller.signal,
    });

    controller.abort();

    await expect(execution).rejects.toBeInstanceOf(GitCommandAbortedError);
  });
});
