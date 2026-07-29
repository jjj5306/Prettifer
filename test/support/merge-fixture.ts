import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface MergeFixture {
  readonly path: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly commits: {
    /** Baseline on the base branch. */
    readonly base: string;
    /** Adds `mainline.txt` on the working branch. */
    readonly mainline: string;
    /** Two-parent merge of the working branch and `side-one`. */
    readonly merge: string;
    /** Adds `follow-up.txt` after the merge. */
    readonly followUp: string;
    /** Three-parent merge of the working branch, `side-two` and `side-three`. */
    readonly octopus: string;
  };
  git(args: readonly string[]): string;
  dispose(): Promise<void>;
}

/**
 * History whose merge commits have parents with distinct, non-empty changes, so
 * a test can tell which mainline parent a composition actually used.
 *
 * ```text
 * main            base
 *                  ├── side-one    add side-one.txt
 *                  ├── side-two    add side-two.txt
 *                  ├── side-three  add side-three.txt
 *                  └── feature/merge-history
 *                        mainline    add mainline.txt
 *                        merge       merge side-one        (parents: mainline, side-one)
 *                        followUp    add follow-up.txt
 *                        octopus     merge side-two, side-three
 *                                    (parents: followUp, side-two, side-three)
 * ```
 */
export async function createMergeFixture(): Promise<MergeFixture> {
  // realpath resolves 8.3 short names so fixture paths match what Git reports.
  const path = await realpath(await mkdtemp(join(tmpdir(), "prettifer-merge-")));
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
  git(["config", "user.name", "Merge Fixture"]);
  git(["config", "user.email", "merge@example.test"]);
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
  const addFile = async (name: string, contents: string): Promise<void> => {
    await writeFile(join(path, name), contents, "utf8");
    git(["add", name]);
  };
  const branchFromBase = async (
    branch: string,
    name: string,
    message: string,
  ): Promise<void> => {
    git(["switch", "--detach", "main"]);
    git(["switch", "-c", branch]);
    await addFile(name, `${name}\n`);
    commit(message);
  };
  const merge = (message: string, branches: readonly string[]): string => {
    git(["merge", "--no-ff", ...branches, "-m", message]);
    return git(["rev-parse", "HEAD"]).trim();
  };

  await addFile("README.md", "# Merge fixture\n");
  const base = commit("chore: create merge baseline");

  await branchFromBase("side-one", "side-one.txt", "feat: add side one");
  await branchFromBase("side-two", "side-two.txt", "feat: add side two");
  await branchFromBase("side-three", "side-three.txt", "feat: add side three");

  git(["switch", "main"]);
  git(["switch", "-c", "feature/merge-history"]);
  await addFile("mainline.txt", "mainline\n");
  const mainline = commit("feat: add mainline change");

  const mergeCommit = merge("merge: include side one", ["side-one"]);

  await addFile("follow-up.txt", "follow up\n");
  const followUp = commit("feat: add follow-up change");

  const octopus = merge("merge: include side two and side three", [
    "side-two",
    "side-three",
  ]);

  return {
    path,
    baseRef: "main",
    headRef: "feature/merge-history",
    commits: { base, mainline, merge: mergeCommit, followUp, octopus },
    git,
    async dispose(): Promise<void> {
      await rm(path, { force: true, recursive: true });
    },
  };
}
