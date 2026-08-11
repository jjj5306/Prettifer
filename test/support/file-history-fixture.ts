import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface FileHistoryFixture {
  readonly path: string;
  readonly headCommit: string;
  readonly rangeRevision: string;
  readonly commits: Readonly<{
    base: string;
    modified: string;
    renamed: string;
    binary: string;
    deleted: string;
    recreated: string;
  }>;
  readonly paths: Readonly<{
    original: string;
    current: string;
    binary: string;
    reused: string;
  }>;
  git(args: readonly string[]): string;
  dispose(): Promise<void>;
}

export async function createFileHistoryFixture(
  fillerCommits = 0,
): Promise<FileHistoryFixture> {
  const path = await realpath(await mkdtemp(join(tmpdir(), "prettifer-file-history-")));
  const git = (args: readonly string[]): string => execFileSync("git", args, {
    cwd: path,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" },
    windowsHide: true,
  });
  git(["init", "-b", "main"]);
  git(["config", "user.name", "File History Fixture"]);
  git(["config", "user.email", "file-history@example.test"]);
  git(["config", "core.autocrlf", "false"]);

  let sequence = 0;
  const commit = (message: string): string => {
    sequence += 1;
    git(["add", "--all"]);
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
  const write = async (name: string, contents: string | Uint8Array): Promise<void> => {
    await mkdir(dirname(join(path, name)), { recursive: true });
    await writeFile(join(path, name), contents);
  };
  const body = (marker: string): string => `${Array.from(
    { length: 20 },
    (_unused, line) => `${marker} line ${String(line)}`,
  ).join("\n")}\n`;

  const paths = {
    original: "src/original.txt",
    current: "src/current.txt",
    binary: "assets/data.bin",
    reused: "src/reused.txt",
  } as const;
  await write(paths.original, body("original"));
  await write(paths.binary, new Uint8Array([0, 1, 2, 3, 4]));
  await write(paths.reused, "first lifetime\n");
  const base = commit("chore: create file history baseline");

  git(["switch", "-c", "feature/file-history"]);
  await write(paths.original, body("original").replace("line 0", "line zero"));
  const modified = commit("feat: modify tracked file");

  await mkdir(dirname(join(path, paths.current)), { recursive: true });
  git(["mv", "--", paths.original, paths.current]);
  await write(paths.current, body("original").replace("line 1", "line one renamed"));
  const renamed = commit("refactor: rename tracked file");

  await write(paths.binary, new Uint8Array([0, 1, 2, 8, 9, 10]));
  const binary = commit("feat: update binary file");

  await unlink(join(path, paths.reused));
  const deleted = commit("chore: delete reusable path");
  await write(paths.reused, "second lifetime\n");
  const recreated = commit("feat: recreate reusable path");

  for (let index = 0; index < fillerCommits; index += 1) {
    await write(paths.current, `${body("original")}filler ${String(index)}\n`);
    commit(`test: file history filler ${String(index).padStart(3, "0")}`);
  }
  const headCommit = git(["rev-parse", "HEAD"]).trim();
  return {
    path,
    headCommit,
    rangeRevision: `${base}:${headCommit}:${base}`,
    commits: { base, modified, renamed, binary, deleted, recreated },
    paths,
    git,
    async dispose(): Promise<void> {
      await rm(path, { recursive: true, force: true });
    },
  };
}
