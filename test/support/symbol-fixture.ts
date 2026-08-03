import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface SymbolFixture {
  readonly path: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly commits: {
    /** Baseline with `UtVar.java` and a `Caller.java` that does not use it. */
    readonly base: string;
    /** Makes `Caller.java` construct and call `UtVar`. */
    readonly callUtVar: string;
  };
  git(args: readonly string[]): string;
  dispose(): Promise<void>;
}

/**
 * Java history where the only changed file references a class declared in a file
 * no commit touches. Navigating to that declaration therefore has to leave the
 * selected result, which is what makes this fixture different from the others.
 */
export async function createSymbolFixture(): Promise<SymbolFixture> {
  // realpath resolves 8.3 short names so fixture paths match what Git reports.
  const path = await realpath(await mkdtemp(join(tmpdir(), "prettifer-symbols-")));
  const git = (args: readonly string[]): string =>
    execFileSync("git", args, {
      cwd: path,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
      windowsHide: true,
    });

  git(["init", "-b", "main"]);
  git(["config", "user.name", "Symbol Fixture"]);
  git(["config", "user.email", "symbols@example.test"]);
  git(["config", "core.autocrlf", "false"]);

  let sequence = 0;
  const commit = (message: string): string => {
    sequence += 1;
    const date = new Date(Date.UTC(2025, 0, 1, 0, 0, sequence)).toISOString();
    execFileSync("git", ["commit", "-m", message], {
      cwd: path,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
        GIT_CONFIG_NOSYSTEM: "1",
      },
      windowsHide: true,
    });
    return git(["rev-parse", "HEAD"]).trim();
  };
  const write = async (name: string, lines: readonly string[]): Promise<void> => {
    const target = join(path, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${lines.join("\n")}\n`, "utf8");
    git(["add", name]);
  };

  await write("src/model/UtVar.java", [
    "package model;",
    "",
    "public class UtVar {",
    "    public int total() {",
    "        return 1;",
    "    }",
    "}",
  ]);
  await write("src/app/Caller.java", [
    "package app;",
    "",
    "public class Caller {",
    "    public int run() {",
    "        return 0;",
    "    }",
    "}",
  ]);
  const base = commit("chore: create the symbol baseline");

  git(["switch", "-c", "feature/symbol-history"]);

  await write("src/app/Caller.java", [
    "package app;",
    "",
    "import model.UtVar;",
    "",
    "public class Caller {",
    "    public int run() {",
    "        UtVar counter = new UtVar();",
    "        return counter.total();",
    "    }",
    "}",
  ]);
  const callUtVar = commit("feat(app): call UtVar from Caller");

  return {
    path,
    baseRef: "main",
    headRef: "feature/symbol-history",
    commits: { base, callUtVar },
    git,
    async dispose(): Promise<void> {
      await rm(path, { force: true, recursive: true });
    },
  };
}
