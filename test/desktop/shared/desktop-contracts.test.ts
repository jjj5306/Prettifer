import { describe, expect, it } from "vitest";

import {
  cancelCompositionRequestSchema,
  commitPageRequestSchema,
  compositeFileChangeSchema,
  compositionRequestSchema,
  diagnosticSchema,
  fileCommitChangeSchema,
  fileCommitRequestSchema,
  fileHistoryPageSchema,
  fileHistoryRequestSchema,
  rangeRequestSchema,
  repositorySessionSchema,
} from "../../../src/desktop/shared/index.js";

const session = {
  repositorySessionId: "018f47a2-bf41-7f18-8b12-52b403acd571",
  sessionRevision: 1,
  rootPath: "C:\\work\\repo",
  currentBranch: "feature/ui",
  branches: [
    {
      name: "feature/ui",
      commitId: "a".repeat(40),
      isCurrent: true,
    },
  ],
};

const range = {
  baseRef: "main",
  baseRefCommit: "b".repeat(40),
  headRef: "feature/ui",
  headCommit: "a".repeat(40),
  baseCommit: "c".repeat(40),
  rangeRevision: `${"b".repeat(40)}:${"a".repeat(40)}:${"c".repeat(40)}`,
};

describe("desktop shared contracts", () => {
  it("accepts a serializable repository session", () => {
    expect(repositorySessionSchema.parse(session)).toEqual(session);
  });

  it("rejects extra properties and invalid revisions", () => {
    expect(() => rangeRequestSchema.parse({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 0,
      baseRef: "main",
      headRef: "feature/ui",
    })).toThrow();
    expect(() => repositorySessionSchema.parse({
      ...session,
      branches: [{ ...session.branches[0], commitId: "short" }],
    })).toThrow();
  });

  it("validates branch ranges and commit pages", () => {
    const rangeRequest = {
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 1,
      baseRef: "main",
      headRef: "feature/ui",
    };
    expect(rangeRequestSchema.parse(rangeRequest)).toEqual(rangeRequest);
    expect(commitPageRequestSchema.parse({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 1,
      range,
      offset: 100,
    })).toMatchObject({ offset: 100 });
    expect(() => commitPageRequestSchema.parse({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 1,
      range,
      offset: -1,
    })).toThrow();
  });

  it("validates composition and cancellation request identities", () => {
    const request = {
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 1,
      range,
      requestId: "01909ee1-2ab8-71f4-80ab-184a9459f4af",
      selectedCommits: ["d".repeat(40)],
    };
    // A request without merge commits gets an empty mainline parent map.
    expect(compositionRequestSchema.parse(request)).toEqual({
      ...request,
      mainlineParents: {},
    });
    expect(compositionRequestSchema.parse({
      ...request,
      mainlineParents: { [request.selectedCommits[0] ?? ""]: 2 },
    })).toMatchObject({
      mainlineParents: { [request.selectedCommits[0] ?? ""]: 2 },
    });
    expect(() => compositionRequestSchema.parse({
      ...request,
      mainlineParents: { [request.selectedCommits[0] ?? ""]: 0 },
    })).toThrow();
    expect(cancelCompositionRequestSchema.parse({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 1,
      requestId: request.requestId,
    })).toBeDefined();
    expect(() => compositionRequestSchema.parse({
      ...request,
      selectedCommits: [],
    })).toThrow();
  });

  it("requires actionable diagnostics", () => {
    expect(diagnosticSchema.parse({
      code: "INVALID_REPOSITORY",
      message: "The Git repository could not be opened.",
      subject: "C:\\work\\plain-folder",
      nextAction: "Choose another Git repository folder.",
    })).toBeDefined();
    expect(() => diagnosticSchema.parse({
      code: "INVALID_REPOSITORY",
      message: "The Git repository could not be opened.",
    })).toThrow();
  });

  it("validates file history paging, rename boundaries and partial state", () => {
    const request = {
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 1,
      range,
      requestId: "01909ee1-2ab8-71f4-80ab-184a9459f4af",
      path: "src/current.ts",
    };
    expect(fileHistoryRequestSchema.parse(request)).toMatchObject({ offset: 0 });
    expect(fileHistoryPageSchema.parse({
      rangeRevision: range.rangeRevision,
      path: request.path,
      entries: [{
        id: "d".repeat(40),
        shortId: "d".repeat(7),
        parents: ["c".repeat(40)],
        title: "rename file",
        authorName: "Author",
        authoredAt: "2025-01-01T00:00:00Z",
        status: "renamed",
        previousPath: "src/old.ts",
        path: request.path,
        similarity: 87,
      }],
      nextOffset: null,
      partial: {
        reason: "shallow",
        message: "Only known history is shown.",
        nextAction: "Fetch more history.",
      },
    })).toBeDefined();
    expect(() => fileHistoryPageSchema.parse({
      rangeRevision: range.rangeRevision,
      path: request.path,
      entries: [{
        id: "d".repeat(40),
        shortId: "d".repeat(7),
        parents: [],
        title: "invalid rename",
        authorName: "Author",
        authoredAt: "2025-01-01T00:00:00Z",
        status: "renamed",
        path: request.path,
      }],
      nextOffset: null,
      partial: null,
    })).toThrow();
  });

  it("validates file commit requests and binary metadata", () => {
    const request = {
      repositorySessionId: session.repositorySessionId,
      sessionRevision: 1,
      range,
      requestId: "01909ee1-2ab8-71f4-80ab-184a9459f4af",
      path: "assets/data.bin",
      commitId: "d".repeat(40),
    };
    expect(fileCommitRequestSchema.parse(request)).toMatchObject({ selected: false });
    expect(fileCommitChangeSchema.parse({
      commitId: request.commitId,
      parentCommit: "c".repeat(40),
      parentNumber: 1,
      path: request.path,
      status: "modified",
      binary: true,
      beforeContent: null,
      afterContent: null,
      beforeSize: 5,
      afterSize: 6,
    })).toBeDefined();
  });

  it.each([
    {
      path: "src/new.ts",
      status: "added",
      beforeContent: null,
      afterContent: "new",
    },
    {
      path: "src/app.ts",
      status: "modified",
      beforeContent: "old",
      afterContent: "new",
    },
    {
      path: "src/old.ts",
      status: "deleted",
      beforeContent: "old",
      afterContent: null,
    },
    {
      path: "assets/logo.png",
      status: "modified",
      binary: true,
      beforeContent: null,
      afterContent: null,
    },
    {
      path: "lib/moved.ts",
      status: "renamed",
      previousPath: "src/moved.ts",
      similarity: 100,
      beforeContent: "moved",
      afterContent: "moved",
    },
    {
      path: "assets/logo-v2.png",
      status: "renamed",
      previousPath: "assets/logo.png",
      similarity: 74,
      binary: true,
      beforeContent: null,
      afterContent: null,
    },
  ])("accepts a valid composite file state: $status", (file) => {
    expect(compositeFileChangeSchema.parse(file)).toEqual(file);
  });

  it.each([
    {
      path: "src/new.ts",
      status: "added",
      beforeContent: null,
      afterContent: null,
    },
    {
      path: "src/app.ts",
      status: "modified",
      beforeContent: null,
      afterContent: "new",
    },
    {
      path: "src/old.ts",
      status: "deleted",
      beforeContent: "old",
      afterContent: "new",
    },
    {
      path: "assets/logo.png",
      status: "modified",
      binary: true,
      beforeContent: "decoded",
      afterContent: null,
    },
    // A rename without the path it moved from is not reviewable.
    {
      path: "lib/moved.ts",
      status: "renamed",
      similarity: 100,
      beforeContent: "moved",
      afterContent: "moved",
    },
    {
      path: "lib/moved.ts",
      status: "renamed",
      previousPath: "src/moved.ts",
      similarity: 101,
      beforeContent: "moved",
      afterContent: "moved",
    },
  ])("rejects an impossible composite file state: $status", (file) => {
    expect(() => compositeFileChangeSchema.parse(file)).toThrow();
  });
});
