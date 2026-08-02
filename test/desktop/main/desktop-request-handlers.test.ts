import { describe, expect, it, vi } from "vitest";

import { createDesktopRequestHandlers } from "../../../src/desktop/main/desktop-request-handlers.js";
import { RepositorySessionError } from "../../../src/desktop/main/repository-session.js";

const repositorySessionId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const baseCommit = "b".repeat(40);
const headCommit = "a".repeat(40);
const commonCommit = "c".repeat(40);
const range = {
  baseRef: "main",
  baseRefCommit: baseCommit,
  headRef: "feature/ui",
  headCommit,
  baseCommit: commonCommit,
  rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
};
const session = {
  repositorySessionId,
  sessionRevision: 1,
  rootPath: "C:\\work\\repo",
  currentBranch: "feature/ui",
  branches: [
    { name: "main", commitId: baseCommit, isCurrent: false },
    { name: "feature/ui", commitId: headCommit, isCurrent: true },
  ],
};

const trustedEvent = {
  senderId: 17,
  frameUrl: "http://localhost:3000/main_window/index.html",
};

function createDependencies() {
  return {
    trustedWindow: () => ({
      senderId: 17,
      frameUrl: "http://localhost:3000/main_window/index.html",
    }),
    sessions: {
      require: vi.fn().mockReturnValue(session),
    },
    repositoryController: {
      selectRepository: vi.fn().mockResolvedValue({ status: "success", data: session }),
      openInitialRepository: vi.fn().mockResolvedValue({ status: "cancelled" }),
    },
    symbols: {
      search: vi.fn().mockResolvedValue({ hits: [], truncated: false }),
    },
    history: {
      createRange: vi.fn().mockResolvedValue({
        baseRef: range.baseRef,
        baseRefCommit: range.baseRefCommit,
        headRef: range.headRef,
        headCommit: range.headCommit,
        baseCommit: range.baseCommit,
        revision: range.rangeRevision,
      }),
      listCommits: vi.fn().mockResolvedValue({
        rangeRevision: range.rangeRevision,
        commits: [],
        nextOffset: null,
      }),
    },
    composition: {
      compose: vi.fn().mockResolvedValue({ status: "success", data: {
        baseCommit: commonCommit,
        selectedCommits: ["d".repeat(40)],
        files: [],
        mainlineParents: {},
        problemFiles: [],
        unifiedDiff: "",
      } }),
      cancel: vi.fn().mockReturnValue({ status: "success", data: null }),
    },
  };
}

describe("desktop request handlers", () => {
  it("accepts a request from the current application frame", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.loadRange(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      baseRef: range.baseRef,
      headRef: range.headRef,
    })).resolves.toMatchObject({ status: "success" });
    expect(dependencies.sessions.require).toHaveBeenCalledWith(repositorySessionId, 1);
  });

  it("accepts Electron's normalized Windows file URL for the trusted frame", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers({
      ...dependencies,
      trustedWindow: () => ({
        senderId: 7,
        frameUrl: "file://C:\\Prettifer\\index.html",
      }),
    });

    await expect(handlers.selectRepository({
      senderId: 7,
      frameUrl: "file:///C:/Prettifer/index.html",
    })).resolves.toMatchObject({ status: "success" });
  });

  it("rejects a different sender window and a different frame URL", async () => {
    const handlers = createDesktopRequestHandlers(createDependencies());

    await expect(handlers.loadRange({ ...trustedEvent, senderId: 99 }, {
      repositorySessionId,
      sessionRevision: 1,
      baseRef: range.baseRef,
      headRef: range.headRef,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "UNTRUSTED_SENDER" },
    });
    await expect(handlers.loadRange({
      ...trustedEvent,
      frameUrl: "https://example.com/",
    }, {
      repositorySessionId,
      sessionRevision: 1,
      baseRef: range.baseRef,
      headRef: range.headRef,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "UNTRUSTED_SENDER" },
    });
  });

  it("rejects invalid schemas before reading a repository session", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.loadRange(trustedEvent, {
      repositorySessionId,
      sessionRevision: 0,
      baseRef: range.baseRef,
      headRef: range.headRef,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "INVALID_REQUEST" },
    });
    expect(dependencies.sessions.require).not.toHaveBeenCalled();
  });

  it("turns an expired session into an actionable diagnostic", async () => {
    const dependencies = createDependencies();
    dependencies.sessions.require.mockImplementation(() => {
      throw new RepositorySessionError(repositorySessionId);
    });
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.loadRange(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      baseRef: range.baseRef,
      headRef: range.headRef,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "SESSION_EXPIRED" },
    });
  });

  it("rejects a newly loaded range when its branch tips no longer match the session", async () => {
    const dependencies = createDependencies();
    dependencies.history.createRange.mockResolvedValue({
      baseRef: range.baseRef,
      baseRefCommit: range.baseRefCommit,
      headRef: range.headRef,
      headCommit: "e".repeat(40),
      baseCommit: range.baseCommit,
      revision: `${range.baseRefCommit}:${"e".repeat(40)}:${range.baseCommit}`,
    });
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.loadRange(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      baseRef: range.baseRef,
      headRef: range.headRef,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "RANGE_EXPIRED" },
    });
    expect(dependencies.history.listCommits).not.toHaveBeenCalled();
  });

  it("does not expose diagnostic-shaped errors from untrusted implementations", async () => {
    const dependencies = createDependencies();
    dependencies.history.listCommits.mockRejectedValue(Object.assign(
      new Error("git -C C:\\secret\\repo failed"),
      { code: "LEAK", subject: "C:\\secret\\repo", nextAction: "raw stderr" },
    ));
    const handlers = createDesktopRequestHandlers(dependencies);

    const result = await handlers.listCommits(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      offset: 0,
    });
    expect(result).toEqual({
      status: "error",
      diagnostic: {
        code: "REQUEST_FAILED",
        message: "The request could not be processed.",
        nextAction: "Check the repository state, then try again.",
      },
    });
  });

  it("rejects a range that does not belong to the current session", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.listCommits(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range: {
        ...range,
        headCommit: "e".repeat(40),
        rangeRevision: `${baseCommit}:${"e".repeat(40)}:${commonCommit}`,
      },
      offset: 0,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "RANGE_EXPIRED" },
    });
    expect(dependencies.history.listCommits).not.toHaveBeenCalled();
  });

  it("validates composition request IDs and selected commits", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.composeSelection(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      requestId,
      selectedCommits: [],
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "INVALID_REQUEST" },
    });
    expect(dependencies.composition.compose).not.toHaveBeenCalled();
  });
});
