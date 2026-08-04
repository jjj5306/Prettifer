import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface HistoryFixtureOptions {
  /**
   * Commits added to the head branch beyond the ones the fixture always makes.
   * The default fills more than one page so paging can be exercised; a test that
   * does not page can ask for fewer and skip the cost.
   */
  readonly fillerCommits?: number;
}

export interface HistoryFixture {
  readonly path: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly baseCommit: string;
  readonly initialHeadCommit: string;
  readonly mergeCommit: string;
  readonly firstFeatureCommit: string;
  git(args: readonly string[]): string;
  advanceHead(): Promise<string>;
  dispose(): Promise<void>;
}

/** One more than a full page, so the first page is full and a second one exists. */
const DEFAULT_FILLER_COMMITS = 103;

export async function createHistoryFixture(
  options: HistoryFixtureOptions = {},
): Promise<HistoryFixture> {
  const fillerCommits = options.fillerCommits ?? DEFAULT_FILLER_COMMITS;
  // realpath resolves 8.3 short names so fixture paths match what Git reports.
  const path = await realpath(await mkdtemp(join(tmpdir(), "prettifer-history-")));
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
  git(["config", "user.name", "History Fixture"]);
  git(["config", "user.email", "history@example.test"]);
  git(["config", "core.autocrlf", "false"]);

  let sequence = 0;
  const commit = (message: string, allowEmpty = false): string => {
    sequence += 1;
    const date = new Date(Date.UTC(2025, 0, 1, 0, 0, sequence)).toISOString();
    const args = ["commit", "-m", message];
    if (allowEmpty) {
      args.splice(1, 0, "--allow-empty");
    }
    execFileSync("git", args, {
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

  await writeFile(join(path, "README.md"), "# History fixture\n", "utf8");
  git(["add", "README.md"]);
  const baseCommit = commit("chore: create history baseline");

  git(["switch", "-c", "feature/desktop-history"]);
  const firstFeatureCommit = commit("feat(history): commit 000", true);

  git(["switch", "-c", "feature/history-side"]);
  await writeFile(join(path, "side.txt"), "side branch\n", "utf8");
  git(["add", "side.txt"]);
  commit("feat(history): add side branch");

  git(["switch", "feature/desktop-history"]);
  for (let index = 1; index <= fillerCommits; index += 1) {
    commit(`feat(history): commit ${String(index).padStart(3, "0")}`, true);
  }
  git(["merge", "--no-ff", "feature/history-side", "-m", "merge: include history side branch"]);
  const mergeCommit = git(["rev-parse", "HEAD"]).trim();
  const initialHeadCommit = mergeCommit;

  return {
    path,
    baseRef: "main",
    headRef: "feature/desktop-history",
    baseCommit,
    initialHeadCommit,
    mergeCommit,
    firstFeatureCommit,
    git,
    advanceHead(): Promise<string> {
      return Promise.resolve(commit("feat(history): advance branch after snapshot", true));
    },
    async dispose(): Promise<void> {
      await rm(path, { force: true, recursive: true });
    },
  };
}
