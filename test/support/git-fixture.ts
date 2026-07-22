import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface FixtureCommits {
  base: string;
  validateLogin: string;
  extractHelpers: string;
  persistSession: string;
  authDocs: string;
  fileLifecycle: string;
}

export interface WorktreeSnapshot {
  branch: string;
  head: string;
  porcelain: string;
  indexDiff: string;
  worktreeDiff: string;
  files: Record<string, string>;
}

export interface GitFixture {
  path: string;
  baseRef: string;
  headRef: string;
  commits: FixtureCommits;
  git(args: readonly string[]): string;
  prepareDirtyWorktree(): Promise<void>;
  snapshotWorktree(): Promise<WorktreeSnapshot>;
  dispose(): Promise<void>;
}

export async function createAuthHistoryFixture(): Promise<GitFixture> {
  const path = await mkdtemp(join(tmpdir(), "prettifer-fixture-"));
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
  git(["config", "user.name", "Prettifer Test"]);
  git(["config", "user.email", "prettifer@example.test"]);
  git(["config", "core.autocrlf", "false"]);

  let commitSequence = 0;
  const commit = (message: string): string => {
    commitSequence += 1;
    const date = `2025-01-01T00:00:${String(commitSequence).padStart(2, "0")}Z`;
    execFileSync("git", ["add", "--all"], { cwd: path, windowsHide: true });
    execFileSync("git", ["commit", "-m", message], {
      cwd: path,
      encoding: "utf8",
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

  await writeFiles(path, {
    "src/auth/login.ts": [
      "export function login(username: string): string {",
      "  return username.trim();",
      "}",
      "",
    ].join("\n"),
    "src/config.ts": "export const auditEnabled = false;\n",
    "src/obsolete.ts": "export const obsolete = true;\n",
    "docs/auth.md": "# Authentication\n",
  });
  const base = commit("chore: create authentication baseline");

  git(["switch", "-c", "feature/auth-session"]);

  await writeFiles(path, {
    "src/auth/login.ts": [
      "export interface LoginRequest {",
      "  username: string;",
      "}",
      "",
      "export function validateLoginRequest(request: LoginRequest): boolean {",
      "  return request.username.trim().length > 0;",
      "}",
      "",
      "export function login(username: string): string {",
      "  return username.trim();",
      "}",
      "",
    ].join("\n"),
  });
  const validateLogin = commit("feat(auth): validate login request");

  await writeFiles(path, {
    "src/auth/credentials.ts": [
      "export function normalizeUsername(username: string): string {",
      "  return username.trim().toLowerCase();",
      "}",
      "",
    ].join("\n"),
  });
  const extractHelpers = commit("refactor(auth): extract credential helpers");

  await writeFiles(path, {
    "src/auth/login.ts": [
      "export interface LoginRequest {",
      "  username: string;",
      "}",
      "",
      "export function validateLoginRequest(request: LoginRequest): boolean {",
      "  return request.username.trim().length > 0;",
      "}",
      "",
      "export function login(username: string): string {",
      "  return username.trim();",
      "}",
      "",
      "export function persistSession(sessionId: string): string {",
      "  return `session:${sessionId}`;",
      "}",
      "",
    ].join("\n"),
    "src/auth/session.ts": "export const sessionStorage = new Map<string, string>();\n",
  });
  const persistSession = commit("feat(auth): persist session");

  await writeFiles(path, {
    "docs/auth.md": [
      "# Authentication",
      "",
      "Sessions are stored after a validated login request.",
      "",
    ].join("\n"),
  });
  const authDocs = commit("docs(auth): explain session lifecycle");

  await writeFiles(path, {
    "src/auth/audit.ts": "export const auditLogin = (user: string): string => user;\n",
    "src/config.ts": "export const auditEnabled = true;\n",
  });
  await unlink(join(path, "src", "obsolete.ts"));
  const fileLifecycle = commit("feat(auth): update audit file lifecycle");

  return {
    path,
    baseRef: "main",
    headRef: "feature/auth-session",
    commits: {
      base,
      validateLogin,
      extractHelpers,
      persistSession,
      authDocs,
      fileLifecycle,
    },
    git,
    async prepareDirtyWorktree(): Promise<void> {
      await writeFile(
        join(path, "src", "config.ts"),
        "export const auditEnabled = true;\nexport const localAudit = true;\n",
        "utf8",
      );
      git(["add", "src/config.ts"]);
      await writeFile(
        join(path, "src", "auth", "login.ts"),
        `${await readFile(join(path, "src", "auth", "login.ts"), "utf8")}\n// local login experiment\n`,
        "utf8",
      );
      await mkdir(join(path, "notes"), { recursive: true });
      await writeFile(
        join(path, "notes", "local-review.txt"),
        "local review notes\n",
        "utf8",
      );
    },
    async snapshotWorktree(): Promise<WorktreeSnapshot> {
      const listedFiles = git(["ls-files", "-co", "--exclude-standard", "-z"])
        .split("\0")
        .filter((file) => file.length > 0)
        .sort();
      const files: Record<string, string> = {};
      for (const file of listedFiles) {
        files[file] = await readFile(join(path, file), "utf8");
      }
      return {
        branch: git(["branch", "--show-current"]).trim(),
        head: git(["rev-parse", "HEAD"]).trim(),
        porcelain: git(["status", "--short", "--untracked-files=all"]),
        indexDiff: git(["diff", "--cached", "--binary"]),
        worktreeDiff: git(["diff", "--binary"]),
        files,
      };
    },
    async dispose(): Promise<void> {
      await rm(path, { force: true, recursive: true });
    },
  };
}

async function writeFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const target = join(root, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }),
  );
}
