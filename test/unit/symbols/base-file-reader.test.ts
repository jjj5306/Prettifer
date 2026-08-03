import { describe, expect, it, vi } from "vitest";

import { GitCommandError } from "../../../src/git/git-command-runner.js";
import { BaseFileError, BaseFileReader } from "../../../src/symbols/base-file-reader.js";

const commit = "c".repeat(40);
const repository = "C:/work/repo";

type Git = ConstructorParameters<typeof BaseFileReader>[0];

/** Answers each Git call in order, so a test states only what it needs. */
function runner(...replies: readonly (string | { stdout: string; exitCode: number })[]): {
  git: Git;
  run: ReturnType<typeof vi.fn>;
} {
  const run = vi.fn();
  for (const reply of replies) {
    run.mockResolvedValueOnce(
      typeof reply === "string"
        ? { stdout: reply, stderr: "", exitCode: 0 }
        : { ...reply, stderr: "" },
    );
  }
  return { git: { run } as unknown as Git, run };
}

describe("BaseFileReader", () => {
  it("reads the file at the commit, never the working tree", async () => {
    const { git, run } = runner("blob\n", "21\n", "public class UtVar {}\n");

    const file = await new BaseFileReader(git).read(repository, commit, "src/UtVar.java");

    expect(file).toEqual({
      path: "src/UtVar.java",
      contents: "public class UtVar {}\n",
    });
    for (const call of run.mock.calls) {
      expect((call[0] as string[]).join(" ")).toContain(`${commit}:src/UtVar.java`);
    }
  });

  it("reports a path the comparison base does not have", async () => {
    const { git } = runner({ stdout: "", exitCode: 128 });

    await expect(new BaseFileReader(git).read(repository, commit, "src/gone.java"))
      .rejects.toMatchObject({ code: "BASE_FILE_MISSING" });
  });

  it("reports a directory as missing rather than reading a tree", async () => {
    const { git } = runner("tree\n");

    await expect(new BaseFileReader(git).read(repository, commit, "src"))
      .rejects.toMatchObject({ code: "BASE_FILE_MISSING" });
  });

  it("refuses a file too large to review", async () => {
    const { git, run } = runner("blob\n", "9000\n");

    await expect(new BaseFileReader(git, 1024).read(repository, commit, "src/big.java"))
      .rejects.toMatchObject({ code: "BASE_FILE_TOO_LARGE" });
    // The contents were never read, so a huge blob never reaches memory.
    expect(run.mock.calls).toHaveLength(2);
  });

  it("refuses a binary file instead of showing its bytes as text", async () => {
    const { git } = runner("blob\n", "4\n", "PN\u0000G");

    await expect(new BaseFileReader(git).read(repository, commit, "docs/logo.png"))
      .rejects.toMatchObject({ code: "BASE_FILE_BINARY" });
  });

  it.each([
    ["an absolute path", "/etc/passwd"],
    ["a Windows path", "C:/Windows/System32/drivers/etc/hosts"],
    ["a parent segment", "src/../../secrets.txt"],
    ["a backslash path", "src\\UtVar.java"],
    ["an empty path", ""],
  ])("refuses %s without running Git", async (_name, path) => {
    const { git, run } = runner("blob\n");

    await expect(new BaseFileReader(git).read(repository, commit, path))
      .rejects.toBeInstanceOf(BaseFileError);
    expect(run.mock.calls).toHaveLength(0);
  });

  it("hides the failing Git command behind one diagnostic", async () => {
    const run = vi.fn().mockRejectedValue(new GitCommandError(
      ["show", `${commit}:src/UtVar.java`],
      128,
      "",
      "fatal: C:/secret/path not a git repository",
    ));
    const git = { run } as unknown as Git;

    const failure = new BaseFileReader(git).read(repository, commit, "src/UtVar.java");

    await expect(failure).rejects.toMatchObject({ code: "BASE_FILE_READ_FAILED" });
    await failure.catch((error: unknown) => {
      expect((error as Error).message).not.toContain("secret");
      expect((error as Error).message).not.toContain("show");
    });
  });
});
