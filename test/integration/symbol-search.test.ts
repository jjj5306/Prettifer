import { describe, expect, it } from "vitest";

import { GitCommandRunner } from "../../src/git/git-command-runner.js";
import { SymbolSearchService } from "../../src/symbols/symbol-search.js";

describe("SymbolSearchService against this repository", () => {
  it("finds a declaration and its uses without touching the working tree", async () => {
    const git = new GitCommandRunner();
    const before = await git.run(["status", "--porcelain"], { cwd: process.cwd() });
    const head = (await git.run(["rev-parse", "HEAD"], { cwd: process.cwd() })).stdout.trim();

    const result = await new SymbolSearchService(git).search(
      process.cwd(),
      head,
      "startDesktopApplication",
    );

    const declaration = result.hits.find((hit) => hit.kind !== null);
    expect(declaration?.path).toBe("src/desktop/main/desktop-application.ts");
    // An exported function reads as a method, not as a type or a variable.
    expect(declaration?.kind).toBe("method");
    // The uses in the entry point and the tests are reported as references.
    expect(result.hits.filter((hit) => hit.kind === null).length).toBeGreaterThan(0);
    expect(result.hits.every((hit) => hit.line > 0)).toBe(true);

    const after = await git.run(["status", "--porcelain"], { cwd: process.cwd() });
    expect(after.stdout).toBe(before.stdout);
  });

  it("reports nothing for a symbol that does not exist", async () => {
    const git = new GitCommandRunner();
    const head = (await git.run(["rev-parse", "HEAD"], { cwd: process.cwd() })).stdout.trim();

    // Built from the commit being searched. A written-out name would be committed
    // in this very file, and the search would rightly find it; no file in a commit
    // can contain that commit's own id.
    const absent = `absent_${head}`;

    await expect(new SymbolSearchService(git).search(
      process.cwd(),
      head,
      absent,
    )).resolves.toEqual({ hits: [], truncated: false });
  });
});
