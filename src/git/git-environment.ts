import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MINIMUM_GIT_VERSION = { major: 2, minor: 30, patch: 0 } as const;

export interface GitVersionReader {
  readVersion(): Promise<string>;
}

export interface GitVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

export type GitEnvironmentErrorCode =
  | "GIT_NOT_FOUND"
  | "GIT_VERSION_INVALID"
  | "GIT_VERSION_UNSUPPORTED";

export class GitEnvironmentError extends Error {
  constructor(
    readonly code: GitEnvironmentErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GitEnvironmentError";
  }
}

export function createGitVersionReader(gitPath = "git"): GitVersionReader {
  return {
    async readVersion(): Promise<string> {
      const { stdout } = await execFileAsync(gitPath, ["--version"], {
        encoding: "utf8",
        windowsHide: true,
      });
      return stdout.trim();
    },
  };
}

export async function verifyGitEnvironment(
  reader: GitVersionReader = createGitVersionReader(),
): Promise<GitVersion> {
  let raw: string;
  try {
    raw = await reader.readVersion();
  } catch (error) {
    throw new GitEnvironmentError(
      "GIT_NOT_FOUND",
      "Git 실행 파일을 찾을 수 없습니다. Git을 설치하거나 Prettifer의 gitPath 설정을 확인해 주세요.",
      { cause: error },
    );
  }

  const version = parseGitVersion(raw);
  if (compareVersion(version, MINIMUM_GIT_VERSION) < 0) {
    throw new GitEnvironmentError(
      "GIT_VERSION_UNSUPPORTED",
      `Git ${formatVersion(MINIMUM_GIT_VERSION)} 이상이 필요합니다. 현재 버전은 ${formatVersion(version)}입니다.`,
    );
  }

  return version;
}

function parseGitVersion(raw: string): GitVersion {
  const match = /git version (\d+)\.(\d+)\.(\d+)/u.exec(raw);
  if (match === null) {
    throw new GitEnvironmentError(
      "GIT_VERSION_INVALID",
      `Git 버전을 확인할 수 없습니다: ${raw}`,
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw,
  };
}

function compareVersion(
  actual: Pick<GitVersion, "major" | "minor" | "patch">,
  minimum: Pick<GitVersion, "major" | "minor" | "patch">,
): number {
  return (
    actual.major - minimum.major ||
    actual.minor - minimum.minor ||
    actual.patch - minimum.patch
  );
}

function formatVersion(
  version: Pick<GitVersion, "major" | "minor" | "patch">,
): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}
