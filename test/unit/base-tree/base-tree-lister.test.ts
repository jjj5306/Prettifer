import { describe, expect, it, vi } from "vitest";

import {
  BaseTreeError,
  BaseTreeLister,
} from "../../../src/base-tree/base-tree-lister.js";
import { GitCommandError } from "../../../src/git/git-command-runner.js";

const commit = "a".repeat(40);

function runnerReturning(stdout: string) {
  return { run: vi.fn().mockResolvedValue({ stdout, stderr: "", exitCode: 0 }) };
}

describe("BaseTreeLister", () => {
  it("reads the tracked paths of a commit", async () => {
    const git = runnerReturning("README.md\0src/app.ts\0");
    const lister = new BaseTreeLister(git as never);

    const listing = await lister.list("C:/repo", commit);

    expect(listing).toEqual({ paths: ["README.md", "src/app.ts"], truncated: false });
  });

  it("asks Git for the commit rather than the working tree", async () => {
    const git = runnerReturning("");
    const lister = new BaseTreeLister(git as never);

    await lister.list("C:/repo", commit);

    expect(git.run).toHaveBeenCalledWith(
      ["ls-tree", "-r", "-z", "--name-only", commit],
      expect.objectContaining({ cwd: "C:/repo" }),
    );
  });

  it("keeps a path that holds a newline in one record", async () => {
    const git = runnerReturning("src/od\nd name.ts\0README.md\0");
    const lister = new BaseTreeLister(git as never);

    await expect(lister.list("C:/repo", commit)).resolves.toEqual({
      paths: ["src/od\nd name.ts", "README.md"],
      truncated: false,
    });
  });

  it("reports an empty commit as no paths", async () => {
    const lister = new BaseTreeLister(runnerReturning("") as never);

    await expect(lister.list("C:/repo", commit)).resolves
      .toEqual({ paths: [], truncated: false });
  });

  it("stops at the limit and says the list was cut", async () => {
    const git = runnerReturning(["a.ts", "b.ts", "c.ts"].join("\0"));
    const lister = new BaseTreeLister(git as never, 2);

    await expect(lister.list("C:/repo", commit)).resolves
      .toEqual({ paths: ["a.ts", "b.ts"], truncated: true });
  });

  it("does not say the list was cut when it fits the limit", async () => {
    const git = runnerReturning(["a.ts", "b.ts"].join("\0"));
    const lister = new BaseTreeLister(git as never, 2);

    await expect(lister.list("C:/repo", commit)).resolves
      .toEqual({ paths: ["a.ts", "b.ts"], truncated: false });
  });

  it("turns a Git failure into a diagnosable error without the command", async () => {
    const git = {
      run: vi.fn().mockRejectedValue(
        new GitCommandError(["ls-tree"], 128, "", "fatal: not a tree object"),
      ),
    };
    const lister = new BaseTreeLister(git as never);

    const failure = await lister.list("C:/repo", commit).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BaseTreeError);
    expect((failure as BaseTreeError).code).toBe("BASE_TREE_LIST_FAILED");
    expect((failure as BaseTreeError).nextAction).not.toBe("");
    expect((failure as BaseTreeError).message).not.toContain("ls-tree");
  });
});
