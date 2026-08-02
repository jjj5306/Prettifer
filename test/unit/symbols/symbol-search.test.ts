import { describe, expect, it, vi } from "vitest";

import { GitCommandError } from "../../../src/git/git-command-runner.js";
import {
  SymbolSearchError,
  SymbolSearchService,
} from "../../../src/symbols/symbol-search.js";

const commit = "c".repeat(40);
const repository = "C:/work/repo";

type Git = ConstructorParameters<typeof SymbolSearchService>[0];

/** Returns the fake runner and its mock separately, so tests never reference a
 * method off the object under test. */
function runner(stdout: string): { git: Git; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn().mockResolvedValue({ stdout, stderr: "", exitCode: 0 });
  return { git: { run } as unknown as Git, run };
}

describe("SymbolSearchService", () => {
  it("reads path, line and text and marks declarations", async () => {
    const { git } = runner([
      `${commit}:src/com/UtVar.java:12:public class UtVar {`,
      `${commit}:src/com/Caller.java:30:    new UtVar("x");`,
    ].join("\n"));

    const result = await new SymbolSearchService(git).search(repository, commit, "UtVar");

    expect(result).toEqual({
      truncated: false,
      hits: [
        {
          path: "src/com/UtVar.java",
          line: 12,
          text: "public class UtVar {",
          isDeclaration: true,
        },
        {
          path: "src/com/Caller.java",
          line: 30,
          text: '    new UtVar("x");',
          isDeclaration: false,
        },
      ],
    });
  });

  it("searches the commit, never the working tree", async () => {
    const { git, run } = runner("");

    await new SymbolSearchService(git).search(repository, commit, "total");

    const args = run.mock.calls[0]?.[0] as string[];
    expect(args).toContain("grep");
    expect(args).toContain(commit);
    // Word matching keeps `subtotal` out, and fixed strings keep the name literal.
    expect(args).toContain("--word-regexp");
    expect(args).toContain("--fixed-strings");
    // Only the languages the symbol search understands.
    expect(args).toContain("*.java");
    expect(args).toContain("*.ts");
    expect(args).not.toContain("*.md");
  });

  it("keeps a path that contains a colon", async () => {
    const { git } = runner(`${commit}:src/odd:name/UtVar.java:5:class UtVar {`);

    const result = await new SymbolSearchService(git).search(repository, commit, "UtVar");

    expect(result.hits[0]).toMatchObject({ path: "src/odd:name/UtVar.java", line: 5 });
  });

  it("drops files whose language the search does not understand", async () => {
    const { git } = runner([
      `${commit}:README.md:3:total is described here`,
      `${commit}:src/a.ts:1:const total = 1;`,
    ].join("\n"));

    const result = await new SymbolSearchService(git).search(repository, commit, "total");

    expect(result.hits.map((hit) => hit.path)).toEqual(["src/a.ts"]);
  });

  it("reports truncation instead of silently cutting a common name", async () => {
    const lines = Array.from(
      { length: 5 },
      (_unused, index) => `${commit}:src/a${String(index)}.ts:1:const get = 1;`,
    );
    const { git } = runner(lines.join("\n"));

    const result = await new SymbolSearchService(git, 3).search(repository, commit, "get");

    expect(result.hits).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("returns nothing for a name that is not an identifier", async () => {
    const { git, run } = runner("");

    await expect(new SymbolSearchService(git).search(repository, commit, "a b"))
      .resolves.toEqual({ hits: [], truncated: false });
    // Not an identifier, so the repository is never searched.
    expect(run.mock.calls).toHaveLength(0);
  });

  it("hides the failing Git command behind one diagnostic", async () => {
    const git = {
      run: vi.fn().mockRejectedValue(new GitCommandError(
        ["grep", "-e", "total", commit],
        128,
        "",
        "fatal: C:/secret/path not a git repository",
      )),
    } as unknown as ConstructorParameters<typeof SymbolSearchService>[0];

    const failure = new SymbolSearchService(git).search(repository, commit, "total");

    await expect(failure).rejects.toBeInstanceOf(SymbolSearchError);
    await expect(failure).rejects.toMatchObject({ code: "SYMBOL_SEARCH_FAILED" });
    // The message a user sees carries no command or path.
    await failure.catch((error: unknown) => {
      expect((error as Error).message).not.toContain("secret");
      expect((error as Error).message).not.toContain("grep");
    });
  });
});
