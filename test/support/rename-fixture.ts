import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface RenameFixture {
  readonly path: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly commits: {
    /** Baseline on the base branch, holding the files that later move. */
    readonly base: string;
    /** Moves `src/moved.txt` into `lib/`, content untouched. */
    readonly pureMove: string;
    /** Renames `src/edited.txt` in place and edits one of its lines. */
    readonly moveWithEdit: string;
    /** Renames `src/rewritten.txt` in place and replaces every line. */
    readonly rewrite: string;
  };
  /** Paths the fixture uses, so a test never restates a literal. */
  readonly paths: {
    readonly pureFrom: string;
    readonly pureTo: string;
    readonly editedFrom: string;
    readonly editedTo: string;
    readonly rewrittenFrom: string;
    readonly rewrittenTo: string;
    readonly untouched: string;
  };
  git(args: readonly string[]): string;
  dispose(): Promise<void>;
}

/**
 * A twenty-line body, long enough that a one-line edit still leaves Git well
 * above its rename threshold and a full replacement falls well below it. A short
 * file would sit near the boundary, where the judgement is the fixture's shape
 * rather than the behaviour under test.
 */
function body(marker: string): string {
  return `${Array.from(
    { length: 20 },
    (_unused, line) => `${marker} line ${String(line)}`,
  ).join("\n")}\n`;
}

/**
 * History whose working branch moves files in three ways, so a test can tell a
 * detected rename from one Git declines to detect.
 *
 * ```text
 * main   base                    src/moved.txt, src/edited.txt,
 *          │                     src/rewritten.txt, src/kept.txt
 *          └── feature/renames
 *                pureMove        src/moved.txt     → lib/moved.txt
 *                moveWithEdit    src/edited.txt    → src/edited-v2.txt, one line changed
 *                rewrite         src/rewritten.txt → src/rewritten-v2.txt, every line changed
 * ```
 *
 * Only one file leaves `src/`, and it leaves three behind. Moving several of a
 * directory's files elsewhere in separate commits makes Git read the directory
 * itself as renamed, and applying one such commit on its own then conflicts with
 * the files still sitting there — a property of the history, not of the code
 * under test.
 */
export async function createRenameFixture(): Promise<RenameFixture> {
  // realpath resolves 8.3 short names so fixture paths match what Git reports.
  const path = await realpath(await mkdtemp(join(tmpdir(), "prettifer-rename-")));
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
  git(["config", "user.name", "Rename Fixture"]);
  git(["config", "user.email", "rename@example.test"]);
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
    await mkdir(dirname(join(path, name)), { recursive: true });
    await writeFile(join(path, name), contents, "utf8");
    git(["add", "--", name]);
  };
  const move = async (
    from: string,
    to: string,
    contents: string | null,
  ): Promise<void> => {
    await mkdir(dirname(join(path, to)), { recursive: true });
    git(["mv", "--", from, to]);
    if (contents !== null) {
      await writeFile(join(path, to), contents, "utf8");
      git(["add", "--", to]);
    }
  };

  await write("src/moved.txt", body("moved"));
  await write("src/edited.txt", body("edited"));
  await write("src/rewritten.txt", body("rewritten"));
  await write("src/kept.txt", body("kept"));
  const base = commit("chore: create rename baseline");

  git(["switch", "-c", "feature/renames"]);

  await move("src/moved.txt", "lib/moved.txt", null);
  const pureMove = commit("refactor: move moved.txt to lib");

  await move(
    "src/edited.txt",
    "src/edited-v2.txt",
    body("edited").replace("edited line 0\n", "edited line zero, reworked\n"),
  );
  const moveWithEdit = commit("refactor: rename edited.txt and adjust a line");

  await move("src/rewritten.txt", "src/rewritten-v2.txt", body("replaced"));
  const rewrite = commit("refactor: rename rewritten.txt and rewrite it");

  return {
    path,
    baseRef: "main",
    headRef: "feature/renames",
    commits: { base, pureMove, moveWithEdit, rewrite },
    paths: {
      pureFrom: "src/moved.txt",
      pureTo: "lib/moved.txt",
      editedFrom: "src/edited.txt",
      editedTo: "src/edited-v2.txt",
      rewrittenFrom: "src/rewritten.txt",
      rewrittenTo: "src/rewritten-v2.txt",
      untouched: "src/kept.txt",
    },
    git,
    async dispose(): Promise<void> {
      await rm(path, { force: true, recursive: true });
    },
  };
}
