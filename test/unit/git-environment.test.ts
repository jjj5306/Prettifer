import { describe, expect, it } from "vitest";

import {
  GitEnvironmentError,
  verifyGitEnvironment,
  type GitVersionReader,
} from "../../src/git/git-environment.js";

describe("verifyGitEnvironment", () => {
  it("explains how to install or configure Git when the executable is unavailable", async () => {
    const reader: GitVersionReader = {
      readVersion: () => Promise.reject(new Error("spawn git ENOENT")),
    };

    await expect(verifyGitEnvironment(reader)).rejects.toMatchObject({
      code: "GIT_NOT_FOUND",
      message: expect.stringContaining("Git을 설치"),
    });
  });

  it("rejects a Git version outside the supported range", async () => {
    const reader: GitVersionReader = {
      readVersion: () => Promise.resolve("git version 2.29.0"),
    };

    await expect(verifyGitEnvironment(reader)).rejects.toEqual(
      expect.objectContaining<Partial<GitEnvironmentError>>({
        code: "GIT_VERSION_UNSUPPORTED",
        message: expect.stringContaining("2.30.0"),
      }),
    );
  });

  it("returns the parsed version for supported Git", async () => {
    const reader: GitVersionReader = {
      readVersion: () => Promise.resolve("git version 2.52.0.windows.1"),
    };

    await expect(verifyGitEnvironment(reader)).resolves.toEqual({
      major: 2,
      minor: 52,
      patch: 0,
      raw: "git version 2.52.0.windows.1",
    });
  });
});
