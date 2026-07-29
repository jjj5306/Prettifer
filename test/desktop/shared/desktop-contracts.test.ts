import { describe, expect, it } from "vitest";

import {
  cancelCompositionRequestSchema,
  commitPageRequestSchema,
  compositeFileChangeSchema,
  compositionRequestSchema,
  diagnosticSchema,
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
  ])("rejects an impossible composite file state: $status", (file) => {
    expect(() => compositeFileChangeSchema.parse(file)).toThrow();
  });
});
