import { describe, expect, it, vi } from "vitest";

import { createDesktopRequestHandlers } from "../../../src/desktop/main/desktop-request-handlers.js";
import { RepositorySessionError } from "../../../src/desktop/main/repository-session.js";
import { GroupingRuleStoreError } from "../../../src/desktop/main/grouping-rule-store.js";
import { BaseTreeError } from "../../../src/base-tree/base-tree-lister.js";
import { BaseFileError } from "../../../src/symbols/base-file-reader.js";

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
    baseFiles: {
      read: vi.fn().mockResolvedValue({
        path: "src/UtVar.java",
        contents: "public class UtVar {}",
      }),
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
    baseTree: {
      list: vi.fn().mockResolvedValue({
        paths: ["README.md", "src/auth/login.ts"],
        truncated: false,
      }),
    },
    groupingRules: {
      read: vi.fn().mockResolvedValue([{ prefix: "tests", name: "Tests" }]),
      write: vi.fn().mockResolvedValue(undefined),
    },
    appVersion: () => "1.2.3",
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
    fileHistory: {
      list: vi.fn().mockResolvedValue({ status: "cancelled" }),
      readCommit: vi.fn().mockResolvedValue({ status: "cancelled" }),
      cancel: vi.fn().mockReturnValue({ status: "success", data: null }),
    },
  };
}

describe("desktop request handlers", () => {
  it("reports the running application version without a repository session", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.readAppInfo(trustedEvent)).resolves.toEqual({
      status: "success",
      data: { version: "1.2.3" },
    });
    // The introduction screen is about the application, not about a repository.
    expect(dependencies.sessions.require).not.toHaveBeenCalled();
  });

  it("refuses the application version from an untrusted window", async () => {
    const handlers = createDesktopRequestHandlers({
      ...createDependencies(),
      trustedWindow: () => undefined,
    });

    await expect(handlers.readAppInfo(trustedEvent)).resolves.toMatchObject({
      status: "error",
    });
  });

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

  it("searches for a symbol at the comparison base of the requested range", async () => {
    const dependencies = createDependencies();
    dependencies.symbols.search.mockResolvedValue({
      hits: [{
        path: "src/UtVar.java",
        line: 12,
        text: "public class UtVar {",
        kind: "type",
      }],
      truncated: false,
    });
    const handlers = createDesktopRequestHandlers(dependencies);

    const result = await handlers.searchSymbol(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      symbol: "UtVar",
    });

    expect(result).toMatchObject({ status: "success" });
    expect(dependencies.symbols.search).toHaveBeenCalledWith(
      session.rootPath,
      range.baseCommit,
      "UtVar",
      undefined,
    );
  });

  it("rejects a symbol that is not an identifier before searching", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.searchSymbol(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      symbol: "UtVar(); rm -rf",
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "INVALID_REQUEST" },
    });
    expect(dependencies.symbols.search).not.toHaveBeenCalled();
  });

  it("reads a navigation target at the comparison base", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    const result = await handlers.readBaseFile(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      path: "src/UtVar.java",
    });

    expect(result).toEqual({
      status: "success",
      data: { path: "src/UtVar.java", contents: "public class UtVar {}" },
    });
    expect(dependencies.baseFiles.read).toHaveBeenCalledWith(
      session.rootPath,
      range.baseCommit,
      "src/UtVar.java",
      undefined,
    );
  });

  it("keeps a file that cannot be read as an actionable diagnostic", async () => {
    const dependencies = createDependencies();
    dependencies.baseFiles.read.mockRejectedValue(new BaseFileError(
      "BASE_FILE_BINARY",
      "docs/logo.png",
      "Open the file in a viewer for its format.",
      "That file is binary, so it has no text to review.",
    ));
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.readBaseFile(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      path: "docs/logo.png",
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "BASE_FILE_BINARY", subject: "docs/logo.png" },
    });
  });

  it("refuses to read a file outside the session range", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.readBaseFile(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range: {
        ...range,
        headCommit: "e".repeat(40),
        rangeRevision: `${baseCommit}:${"e".repeat(40)}:${commonCommit}`,
      },
      path: "src/UtVar.java",
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "RANGE_EXPIRED" },
    });
    expect(dependencies.baseFiles.read).not.toHaveBeenCalled();
  });
  it("reads the grouping rules of the session repository", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    const result = await handlers.readGroupingRules(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
    });

    expect(result).toEqual({
      status: "success",
      data: { rules: [{ prefix: "tests", name: "Tests" }] },
    });
    expect(dependencies.groupingRules.read).toHaveBeenCalledWith(session.rootPath);
  });

  it("reports a storage failure with a cause and a next action", async () => {
    const dependencies = createDependencies();
    dependencies.groupingRules.read.mockRejectedValue(new GroupingRuleStoreError(
      "GROUPING_RULES_UNREADABLE",
      "Fix or remove the file, then reopen the repository.",
      "The saved grouping rules are not in a form Prettifer understands.",
    ));
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.readGroupingRules(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: {
        code: "GROUPING_RULES_UNREADABLE",
        nextAction: "Fix or remove the file, then reopen the repository.",
      },
    });
  });

  it("saves the grouping rules of the session repository", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);
    const rules = [{ prefix: "tests", name: "Tests" }, { prefix: "docs", name: "Docs" }];

    const result = await handlers.saveGroupingRules(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      rules,
    });

    expect(result).toEqual({ status: "success", data: { rules } });
    expect(dependencies.groupingRules.write).toHaveBeenCalledWith(session.rootPath, rules);
  });

  it("refuses to save a rule the panel could not apply", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.saveGroupingRules(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      rules: [{ prefix: "../outside", name: "Outside" }],
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "GROUP_RULE_PREFIX_NOT_RELATIVE" },
    });
    expect(dependencies.groupingRules.write).not.toHaveBeenCalled();
  });

  it("refuses to save two rules that claim the same prefix", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.saveGroupingRules(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      rules: [{ prefix: "tests", name: "Tests" }, { prefix: "tests/", name: "Suites" }],
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "GROUP_RULE_PREFIX_DUPLICATE" },
    });
    expect(dependencies.groupingRules.write).not.toHaveBeenCalled();
  });
  it("lists the comparison base paths of the requested range", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    const result = await handlers.listBaseTree(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
    });

    expect(result).toEqual({
      status: "success",
      data: { paths: ["README.md", "src/auth/login.ts"], truncated: false },
    });
    expect(dependencies.baseTree.list).toHaveBeenCalledWith(
      session.rootPath,
      range.baseCommit,
      undefined,
    );
  });

  it("refuses to list a range that no longer matches the session", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.listBaseTree(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range: {
        ...range,
        headCommit: "e".repeat(40),
        rangeRevision: `${baseCommit}:${"e".repeat(40)}:${commonCommit}`,
      },
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "RANGE_EXPIRED" },
    });
    expect(dependencies.baseTree.list).not.toHaveBeenCalled();
  });

  it("reports a failed path listing with a next action", async () => {
    const dependencies = createDependencies();
    dependencies.baseTree.list.mockRejectedValue(new BaseTreeError());
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.listBaseTree(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
    })).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "BASE_TREE_LIST_FAILED", subject: "Repository tree" },
    });
  });

  it("validates and routes file history, commit reads, and cancellation", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);
    const historyRequest = {
      repositorySessionId,
      sessionRevision: 1,
      range,
      requestId,
      path: "src/app.ts",
      offset: 0,
    };

    await handlers.listFileHistory(trustedEvent, historyRequest);
    await handlers.readFileCommit(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      requestId,
      path: historyRequest.path,
      commitId: "d".repeat(40),
      selected: true,
      mainlineParent: 2,
    });
    await handlers.cancelFileHistory(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      requestId,
    });

    expect(dependencies.fileHistory.list).toHaveBeenCalledWith(
      { ...historyRequest, mainlineParents: {} },
      session.rootPath,
    );
    expect(dependencies.fileHistory.readCommit).toHaveBeenCalledWith(
      expect.objectContaining({ commitId: "d".repeat(40), mainlineParent: 2 }),
      session.rootPath,
    );
    expect(dependencies.fileHistory.cancel).toHaveBeenCalledWith({
      repositorySessionId,
      sessionRevision: 1,
      requestId,
    });
  });

  it("rejects invalid or expired file history identities before the controller", async () => {
    const dependencies = createDependencies();
    const handlers = createDesktopRequestHandlers(dependencies);

    await expect(handlers.listFileHistory(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range,
      requestId,
      path: "C:\\outside.ts",
      offset: 0,
    })).resolves.toMatchObject({ status: "error", diagnostic: { code: "INVALID_REQUEST" } });
    await expect(handlers.listFileHistory(trustedEvent, {
      repositorySessionId,
      sessionRevision: 1,
      range: {
        ...range,
        headCommit: "e".repeat(40),
        rangeRevision: `${baseCommit}:${"e".repeat(40)}:${commonCommit}`,
      },
      requestId,
      path: "src/app.ts",
      offset: 0,
    })).resolves.toMatchObject({ status: "error", diagnostic: { code: "RANGE_EXPIRED" } });

    expect(dependencies.fileHistory.list).not.toHaveBeenCalled();
  });
});
