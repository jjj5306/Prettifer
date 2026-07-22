import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  createAuthHistoryFixture,
  type GitFixture,
} from "./git-fixture.js";

describe("createAuthHistoryFixture", () => {
  let fixture: GitFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("creates a named linear history from the base branch", async () => {
    fixture = await createAuthHistoryFixture();

    const messages = fixture
      .git(["log", "--reverse", "--format=%s", "main..feature/auth-session"])
      .trim()
      .split("\n");

    expect(messages).toEqual([
      "feat(auth): validate login request",
      "refactor(auth): extract credential helpers",
      "feat(auth): persist session",
      "docs(auth): explain session lifecycle",
      "feat(auth): update audit file lifecycle",
    ]);
    expect(fixture.commits.validateLogin).toMatch(/^[0-9a-f]{40}$/u);
    expect(fixture.commits.persistSession).toMatch(/^[0-9a-f]{40}$/u);
    expect(fixture.baseRef).toBe("main");
    expect(fixture.headRef).toBe("feature/auth-session");
  });

  it("contains same-file changes and add-modify-delete changes", async () => {
    fixture = await createAuthHistoryFixture();

    const loginAtValidation = fixture.git([
      "show",
      `${fixture.commits.validateLogin}:src/auth/login.ts`,
    ]);
    const loginAtSession = fixture.git([
      "show",
      `${fixture.commits.persistSession}:src/auth/login.ts`,
    ]);
    const lifecycleChanges = fixture.git([
      "diff-tree",
      "--no-commit-id",
      "--name-status",
      "-r",
      fixture.commits.fileLifecycle,
    ]);

    expect(loginAtValidation).toContain("validateLoginRequest");
    expect(loginAtSession).toContain("validateLoginRequest");
    expect(loginAtSession).toContain("persistSession");
    expect(lifecycleChanges).toContain("A\tsrc/auth/audit.ts");
    expect(lifecycleChanges).toContain("M\tsrc/config.ts");
    expect(lifecycleChanges).toContain("D\tsrc/obsolete.ts");
  });

  it("captures staged, unstaged, and untracked state exactly", async () => {
    fixture = await createAuthHistoryFixture();
    await fixture.prepareDirtyWorktree();

    const before = await fixture.snapshotWorktree();
    const untracked = await readFile(
      `${fixture.path}/notes/local-review.txt`,
      "utf8",
    );

    expect(before.branch).toBe("feature/auth-session");
    expect(before.porcelain).toContain("M  src/config.ts");
    expect(before.porcelain).toContain(" M src/auth/login.ts");
    expect(before.porcelain).toContain("?? notes/local-review.txt");
    expect(untracked).toBe("local review notes\n");
  });
});
