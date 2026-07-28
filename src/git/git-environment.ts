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
      "Git could not be found. Install Git or check Prettifer's gitPath setting.",
      { cause: error },
    );
  }

  const version = parseGitVersion(raw);
  if (compareVersion(version, MINIMUM_GIT_VERSION) < 0) {
    throw new GitEnvironmentError(
      "GIT_VERSION_UNSUPPORTED",
      `Git ${formatVersion(MINIMUM_GIT_VERSION)} or newer is required. The current version is ${formatVersion(version)}.`,
    );
  }

  return version;
}

function parseGitVersion(raw: string): GitVersion {
  const match = /git version (\d+)\.(\d+)\.(\d+)/u.exec(raw);
  if (match === null) {
    throw new GitEnvironmentError(
      "GIT_VERSION_INVALID",
      `The Git version could not be determined: ${raw}`,
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
