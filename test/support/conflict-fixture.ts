import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ConflictFixture {
  readonly path: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly commits: {
    /** Baseline with `shared.txt`, `clean.txt` and `untouched.txt`. */
    readonly base: string;
    /** Rewrites the first line of `shared.txt`. Meant to be left unselected. */
    readonly prerequisite: string;
    /** Rewrites the same first line and also appends to `clean.txt`. */
    readonly conflicting: string;
    /** Adds `later.txt` only, so it always applies cleanly. */
    readonly independent: string;
    /** Rewrites the last line of `shared.txt`, which applies onto the base. */
    readonly farEdit: string;
    /** Rewrites the first line of `shared.txt` and nothing else. */
    readonly conflictingOnly: string;
  };
  git(args: readonly string[]): string;
  dispose(): Promise<void>;
}

const SHARED_LINES = 10;

function sharedFile(first: string, last: string): string {
  const middle = Array.from(
    { length: SHARED_LINES - 2 },
    (_unused, index) => `line ${String(index + 2)}`,
  );
  return [first, ...middle, last].join("\n") + "\n";
}

/**
 * History where selecting `conflicting` without `prerequisite` conflicts on
 * `shared.txt` while the same commit's `clean.txt` change applies. `shared.txt`
 * has enough lines that `farEdit` touches a different region and merges
 * cleanly onto the base content.
 */
export async function createConflictFixture(): Promise<ConflictFixture> {
  // realpath resolves 8.3 short names so fixture paths match what Git reports.
  const path = await realpath(await mkdtemp(join(tmpdir(), "prettifer-conflict-")));
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
  git(["config", "user.name", "Conflict Fixture"]);
  git(["config", "user.email", "conflict@example.test"]);
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
  const write = async (name: string, contents: string): Promise<void> => {
    await writeFile(join(path, name), contents, "utf8");
    git(["add", name]);
  };

  await write("shared.txt", sharedFile("first line: base", "last line: base"));
  await write("clean.txt", "clean base\n");
  await write("untouched.txt", "untouched\n");
  const base = commit("chore: create conflict baseline");

  git(["switch", "-c", "feature/conflict-history"]);

  await write("shared.txt", sharedFile("first line: prerequisite", "last line: base"));
  const prerequisite = commit("feat: rewrite the first shared line");

  await write("shared.txt", sharedFile("first line: conflicting", "last line: base"));
  await write("clean.txt", "clean base\nclean addition\n");
  const conflicting = commit("feat: rewrite the first shared line again and extend clean");

  await write("later.txt", "later\n");
  const independent = commit("feat: add an independent file");

  await write(
    "shared.txt",
    sharedFile("first line: conflicting", "last line: far edit"),
  );
  const farEdit = commit("feat: rewrite the last shared line");

  await write(
    "shared.txt",
    sharedFile("first line: conflicting only", "last line: far edit"),
  );
  const conflictingOnly = commit("feat: rewrite the first shared line once more");

  return {
    path,
    baseRef: "main",
    headRef: "feature/conflict-history",
    commits: { base, prerequisite, conflicting, independent, farEdit, conflictingOnly },
    git,
    async dispose(): Promise<void> {
      await rm(path, { force: true, recursive: true });
    },
  };
}
