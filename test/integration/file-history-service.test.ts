import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { FileHistoryService } from "../../src/history/file-history-service.js";
import { GitCommandRunner } from "../../src/git/git-command-runner.js";
import { createMergeFixture } from "../support/merge-fixture.js";
import {
  createFileHistoryFixture,
  type FileHistoryFixture,
} from "../support/file-history-fixture.js";

describe("file history service", () => {
  let fixture: FileHistoryFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("follows a renamed file and returns complete commit metadata", async () => {
    fixture = await createFileHistoryFixture();
    const result = await new FileHistoryService().list({
      repositoryPath: fixture.path,
      headCommit: fixture.headCommit,
      rangeRevision: fixture.rangeRevision,
      path: fixture.paths.current,
    });

    expect(result.entries.map((entry) => entry.id)).toEqual([
      fixture.commits.renamed,
      fixture.commits.modified,
      fixture.commits.base,
    ]);
    expect(result.entries[0]).toMatchObject({
      status: "renamed",
      path: fixture.paths.current,
      previousPath: fixture.paths.original,
    });
    expect(result.partial).toBeNull();
  });

  it("does not connect a deleted file to a later file at the same path", async () => {
    fixture = await createFileHistoryFixture();
    const result = await new FileHistoryService().list({
      repositoryPath: fixture.path,
      headCommit: fixture.headCommit,
      rangeRevision: fixture.rangeRevision,
      path: fixture.paths.reused,
    });

    expect(result.entries.map((entry) => entry.id)).toEqual([fixture.commits.recreated]);
  });

  it("pages file changes in groups of at most one hundred", async () => {
    fixture = await createFileHistoryFixture(101);
    const service = new FileHistoryService();
    const first = await service.list({
      repositoryPath: fixture.path,
      headCommit: fixture.headCommit,
      rangeRevision: fixture.rangeRevision,
      path: fixture.paths.current,
    });
    const second = await service.list({
      repositoryPath: fixture.path,
      headCommit: fixture.headCommit,
      rangeRevision: fixture.rangeRevision,
      path: fixture.paths.current,
      offset: first.nextOffset ?? 0,
    });

    expect(first.entries).toHaveLength(100);
    expect(first.nextOffset).toBe(100);
    expect(second.entries.length).toBeGreaterThan(0);
    expect(second.nextOffset).toBeNull();
  }, 60_000);

  it("reads text rename and binary metadata without decoding binary content", async () => {
    fixture = await createFileHistoryFixture();
    const service = new FileHistoryService();
    const renamed = await service.readCommit({
      repositoryPath: fixture.path,
      commitId: fixture.commits.renamed,
      path: fixture.paths.current,
    });
    const binary = await service.readCommit({
      repositoryPath: fixture.path,
      commitId: fixture.commits.binary,
      path: fixture.paths.binary,
    });

    expect(renamed).toMatchObject({
      status: "renamed",
      previousPath: fixture.paths.original,
      binary: false,
    });
    expect(renamed.beforeContent).toContain("original line zero");
    expect(renamed.afterContent).toContain("line one renamed");
    expect(binary).toMatchObject({
      status: "modified",
      binary: true,
      beforeContent: null,
      afterContent: null,
      beforeSize: 5,
      afterSize: 6,
    });
  });

  it("uses the first parent by default and a selected merge mainline when supplied", async () => {
    const merge = await createMergeFixture();
    const service = new FileHistoryService();
    try {
      await expect(service.readCommit({
        repositoryPath: merge.path,
        commitId: merge.commits.merge,
        path: "side-one.txt",
        requireMainline: true,
      })).rejects.toMatchObject({ code: "MAINLINE_PARENT_REQUIRED" });

      await expect(service.readCommit({
        repositoryPath: merge.path,
        commitId: merge.commits.merge,
        path: "side-one.txt",
      })).resolves.toMatchObject({ status: "added", parentNumber: 1 });
      await expect(service.readCommit({
        repositoryPath: merge.path,
        commitId: merge.commits.merge,
        path: "mainline.txt",
        mainlineParent: 2,
      })).resolves.toMatchObject({ status: "added", parentNumber: 2 });
      await expect(service.readCommit({
        repositoryPath: merge.path,
        commitId: merge.commits.merge,
        path: "side-one.txt",
        mainlineParent: 3,
      })).rejects.toMatchObject({ code: "MAINLINE_PARENT_OUT_OF_RANGE" });

      const history = await service.list({
        repositoryPath: merge.path,
        headCommit: merge.commits.octopus,
        rangeRevision: `${merge.commits.base}:${merge.commits.octopus}`,
        path: "side-one.txt",
      });
      expect(history.entries.map((entry) => entry.id)).toEqual([merge.commits.merge]);
      const secondMainline = await service.list({
        repositoryPath: merge.path,
        headCommit: merge.commits.octopus,
        rangeRevision: `${merge.commits.base}:${merge.commits.octopus}`,
        path: "mainline.txt",
        mainlineParents: { [merge.commits.merge]: 2 },
      });
      expect(secondMainline.entries.map((entry) => entry.id)).toEqual([merge.commits.merge]);
    } finally {
      await merge.dispose();
    }
  });

  it("marks the available result as partial in a shallow clone", async () => {
    fixture = await createFileHistoryFixture(3);
    const cloneRoot = await realpath(await mkdtemp(join(tmpdir(), "prettifer-shallow-history-")));
    const clonePath = join(cloneRoot, "repository");
    try {
      execFileSync("git", [
        "clone",
        "--depth", "2",
        "--branch", "feature/file-history",
        pathToFileURL(fixture.path).href,
        clonePath,
      ], { encoding: "utf8", windowsHide: true });
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: clonePath,
        encoding: "utf8",
        windowsHide: true,
      }).trim();

      await expect(new FileHistoryService().list({
        repositoryPath: clonePath,
        headCommit: head,
        rangeRevision: `shallow:${head}`,
        path: fixture.paths.current,
      })).resolves.toMatchObject({
        entries: expect.any(Array),
        partial: {
          reason: "shallow",
          nextAction: expect.stringContaining("Fetch"),
        },
      });
    } finally {
      await rm(cloneRoot, { recursive: true, force: true });
    }
  });

  it("turns a missing Git object into a bounded file-history diagnostic", async () => {
    const git = new GitCommandRunner({
      executor: {
        execute: (request) => Promise.resolve(request.args.includes("log")
          ? { stdout: "", stderr: "fatal: bad object deadbeef", exitCode: 128 }
          : { stdout: "false\n", stderr: "", exitCode: 0 }),
      },
    });

    await expect(new FileHistoryService(git).list({
      repositoryPath: process.cwd(),
      headCommit: "d".repeat(40),
      rangeRevision: "missing-object",
      path: "src/app.ts",
    })).rejects.toMatchObject({
      code: "FILE_HISTORY_FAILED",
      subject: "src/app.ts",
      nextAction: expect.stringContaining("repository history"),
    });
  });
});
