// @vitest-environment jsdom

import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DesktopApi, RepositorySession } from "../../../../src/desktop/shared/index.js";
import { useAppController } from "../../../../src/desktop/renderer/controller/use-app-controller.js";

const session: RepositorySession = {
  repositorySessionId: "00000000-0000-4000-8000-000000000001",
  sessionRevision: 1,
  rootPath: "C:\\work\\repo",
  currentBranch: "main",
  branches: [{ name: "main", commitId: "a".repeat(40), isCurrent: true }],
};

function createApi(overrides: Partial<DesktopApi> = {}): DesktopApi {
  return {
    selectRepository: vi.fn().mockResolvedValue({ status: "cancelled" }),
    openInitialRepository: vi.fn().mockResolvedValue({ status: "cancelled" }),
    searchSymbol: vi.fn().mockResolvedValue({
      status: "success",
      data: { hits: [], truncated: false },
    }),
    loadRange: vi.fn().mockResolvedValue({ status: "error", diagnostic: {
      code: "NO_RANGE",
      message: "No comparison range is available.",
      nextAction: "Choose a branch range.",
    } }),
    listCommits: vi.fn().mockResolvedValue({ status: "error", diagnostic: {
      code: "NO_PAGE",
      message: "No commit page is available.",
      nextAction: "Reload the comparison range.",
    } }),
    composeSelection: vi.fn().mockResolvedValue({ status: "cancelled" }),
    cancelComposition: vi.fn().mockResolvedValue({ status: "success", data: null }),
    readBaseFile: vi.fn().mockResolvedValue({
      status: "success",
      data: { path: "src/UtVar.java", contents: "public class UtVar {}" },
    }),
    ...overrides,
  };
}

const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;

describe("useAppController", () => {
  it("opens the repository the app was started with", async () => {
    const openInitialRepository = vi.fn().mockResolvedValue({
      status: "success",
      data: session,
    });
    const selectRepository = vi.fn();
    const api = createApi({ openInitialRepository, selectRepository });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `repository-${String(++request)}`),
      { wrapper },
    );

    await act(() => Promise.resolve());

    expect(openInitialRepository).toHaveBeenCalledOnce();
    // No folder dialog: the path came from the command line.
    expect(selectRepository).not.toHaveBeenCalled();
    expect(result.current.state.repository).toMatchObject({
      status: "ready",
      session,
    });
  });

  it("stays empty without an error when no repository was given", async () => {
    const api = createApi({
      openInitialRepository: vi.fn().mockResolvedValue({ status: "cancelled" }),
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `repository-${String(++request)}`),
      { wrapper },
    );

    await act(() => Promise.resolve());

    expect(result.current.state.repository).toEqual({ status: "empty" });
  });

  it("shows a diagnostic when the given repository cannot be opened", async () => {
    const api = createApi({
      openInitialRepository: vi.fn().mockResolvedValue({
        status: "error",
        diagnostic: {
          code: "INVALID_REPOSITORY",
          message: "The folder is not a Git repository.",
          subject: "C:\\work\\plain",
          nextAction: "Open a folder that contains a Git repository.",
        },
      }),
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `repository-${String(++request)}`),
      { wrapper },
    );

    await act(() => Promise.resolve());

    expect(result.current.state.repository).toMatchObject({
      status: "error",
      diagnostic: { code: "INVALID_REPOSITORY", subject: "C:\\work\\plain" },
    });
  });

  it("loads a selected repository from a user action", async () => {
    const api = createApi({
      selectRepository: vi.fn().mockResolvedValue({ status: "success", data: session }),
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `repository-${String(++request)}`),
      { wrapper },
    );

    await act(() => result.current.openRepository());

    expect(result.current.state.repository).toEqual({ status: "ready", session });
  });

  it("preserves the current repository on cancellation and displays API diagnostics", async () => {
    const selectRepository = vi
      .fn()
      .mockResolvedValueOnce({ status: "success", data: session })
      .mockResolvedValueOnce({ status: "cancelled" })
      .mockResolvedValueOnce({ status: "error", diagnostic: {
        code: "INVALID_REPOSITORY",
        message: "The Git repository could not be opened.",
        subject: "C:\\work\\plain",
        nextAction: "Choose another folder.",
      } });
    const api = createApi({ selectRepository });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `repository-${String(++request)}`),
      { wrapper },
    );

    await act(() => result.current.openRepository());
    await act(() => result.current.openRepository());
    expect(result.current.state.repository).toEqual({ status: "ready", session });
    await act(() => result.current.openRepository());
    expect(result.current.state.repository).toMatchObject({
      status: "error",
      session,
      diagnostic: { code: "INVALID_REPOSITORY" },
    });
  });

  it("converts a rejected preload call into a connection diagnostic", async () => {
    const api = createApi({
      selectRepository: vi.fn().mockRejectedValue(new Error("IPC unavailable")),
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `repository-${String(++request)}`),
      { wrapper },
    );

    await expect(act(() => result.current.openRepository())).resolves.toBeUndefined();
    expect(result.current.state.repository).toMatchObject({
      status: "error",
      diagnostic: {
        code: "DESKTOP_CONNECTION_FAILED",
        nextAction: "Reopen the app window and try again.",
      },
    });
  });

  it("ignores a late repository response after a newer request", async () => {
    let resolveFirst: ((value: Awaited<ReturnType<DesktopApi["selectRepository"]>>) => void) | undefined;
    let resolveSecond: ((value: Awaited<ReturnType<DesktopApi["selectRepository"]>>) => void) | undefined;
    const first = new Promise<Awaited<ReturnType<DesktopApi["selectRepository"]>>>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<Awaited<ReturnType<DesktopApi["selectRepository"]>>>((resolve) => {
      resolveSecond = resolve;
    });
    const api = createApi({
      selectRepository: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `repository-${String(++request)}`),
      { wrapper },
    );

    let firstCall: Promise<void> | undefined;
    let secondCall: Promise<void> | undefined;
    act(() => {
      firstCall = result.current.openRepository();
      secondCall = result.current.openRepository();
    });
    const newestSession = { ...session, rootPath: "C:\\work\\newest" };
    await act(async () => {
      resolveSecond?.({ status: "success", data: newestSession });
      await secondCall;
    });
    await act(async () => {
      resolveFirst?.({ status: "success", data: session });
      await firstCall;
    });

    expect(result.current.state.repository).toEqual({
      status: "ready",
      session: newestSession,
    });
  });

  it("cancels an active calculation when commit selection changes", async () => {
    const commitId = "d".repeat(40);
    const commonCommit = "c".repeat(40);
    const range = {
      baseRef: "main",
      baseRefCommit: session.branches[0]!.commitId,
      headRef: "main",
      headCommit: session.branches[0]!.commitId,
      baseCommit: commonCommit,
      rangeRevision: `${session.branches[0]!.commitId}:${session.branches[0]!.commitId}:${commonCommit}`,
    };
    const composeResult = new Promise<Awaited<ReturnType<DesktopApi["composeSelection"]>>>(() => undefined);
    const cancelComposition = vi.fn().mockResolvedValue({ status: "success", data: null });
    const api = createApi({
      selectRepository: vi.fn().mockResolvedValue({ status: "success", data: session }),
      loadRange: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          range,
          page: {
            rangeRevision: range.rangeRevision,
            commits: [{
              id: commitId,
              shortId: commitId.slice(0, 7),
              parentIds: [commonCommit],
              title: "select me",
              authorName: "Prettifer Test",
              authoredAt: "2026-07-23T00:00:00.000Z",
              isMerge: false,
              selectable: true,
            }],
            nextOffset: null,
          },
        },
      }),
      composeSelection: vi.fn().mockReturnValue(composeResult),
      cancelComposition,
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `request-${String(++request)}`),
      { wrapper },
    );
    await act(() => result.current.openRepository());
    await act(() => result.current.loadRange("main", "main"));
    act(() => { result.current.toggleCommit(commitId); });
    act(() => { void result.current.composeSelection(); });
    expect(result.current.state.composition.status).toBe("loading");
    // Read the active request instead of a literal: the startup open consumes an
    // id, so a hard-coded sequence number would track an unrelated change.
    const active = result.current.state.composition;
    if (active.status !== "loading") {
      throw new Error("The calculation was not running.");
    }

    act(() => { result.current.toggleCommit(commitId); });
    expect(cancelComposition).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      requestId: active.requestId,
    });
    expect(result.current.state.composition).toEqual({ status: "idle" });
  });
});

describe("useAppController symbol lookup", () => {
  const commitId = "d".repeat(40);
  const commonCommit = "c".repeat(40);
  const range = {
    baseRef: "main",
    baseRefCommit: session.branches[0]!.commitId,
    headRef: "main",
    headCommit: session.branches[0]!.commitId,
    baseCommit: commonCommit,
    rangeRevision: `${session.branches[0]!.commitId}:${session.branches[0]!.commitId}:${commonCommit}`,
  };

  /** Drives the controller to a finished result, ready to be reviewed. */
  async function reviewing(overrides: Partial<DesktopApi> = {}): Promise<{
    controller: { current: ReturnType<typeof useAppController> };
    api: DesktopApi;
  }> {
    const api = createApi({
      selectRepository: vi.fn().mockResolvedValue({ status: "success", data: session }),
      loadRange: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          range,
          page: {
            rangeRevision: range.rangeRevision,
            commits: [{
              id: commitId,
              shortId: commitId.slice(0, 7),
              parentIds: [commonCommit],
              title: "select me",
              authorName: "Prettifer Test",
              authoredAt: "2026-07-23T00:00:00.000Z",
              isMerge: false,
              selectable: true,
            }],
            nextOffset: null,
          },
        },
      }),
      composeSelection: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          baseCommit: commonCommit,
          selectedCommits: [commitId],
          files: [
            {
              path: "src/Caller.java",
              status: "modified",
              beforeContent: "class Caller {}",
              afterContent: "class Caller { UtVar value; }",
            },
            {
              path: "docs/notes.md",
              status: "added",
              beforeContent: null,
              afterContent: "UtVar is described here",
            },
          ],
          mainlineParents: {},
          problemFiles: [],
          unifiedDiff: "diff",
        },
      }),
      ...overrides,
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `request-${String(++request)}`),
      { wrapper },
    );
    await act(() => result.current.openRepository());
    await act(() => result.current.loadRange("main", "main"));
    act(() => { result.current.toggleCommit(commitId); });
    await act(() => result.current.composeSelection());
    return { controller: result, api };
  }

  it("searches the comparison base and replaces the hits of changed files", async () => {
    const searchSymbol = vi.fn().mockResolvedValue({
      status: "success",
      data: {
        // The base still holds the file before the selection changed it.
        hits: [
          { path: "src/Caller.java", line: 1, text: "class Caller {}", isDeclaration: false },
          { path: "src/UtVar.java", line: 4, text: "class UtVar {}", isDeclaration: true },
        ],
        truncated: false,
      },
    });
    const { controller } = await reviewing({ searchSymbol });

    await act(() => controller.current.lookUpSymbol("UtVar", "references"));

    expect(searchSymbol).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      range,
      symbol: "UtVar",
    });
    const lookup = controller.current.state.symbolLookup;
    if (lookup.status !== "ready") {
      throw new Error(`The lookup was ${lookup.status}.`);
    }
    // The stale hit for the changed file is gone, replaced by the composed line.
    expect(lookup.hits).toEqual([
      { path: "src/Caller.java", line: 1, text: "class Caller { UtVar value; }", isDeclaration: false },
      { path: "src/UtVar.java", line: 4, text: "class UtVar {}", isDeclaration: true },
    ]);
  });

  it("reports an unsupported file without searching", async () => {
    const searchSymbol = vi.fn();
    const { controller } = await reviewing({ searchSymbol });
    act(() => { controller.current.selectFile("docs/notes.md"); });

    await act(() => controller.current.lookUpSymbol("UtVar", "references"));

    expect(searchSymbol).not.toHaveBeenCalled();
    expect(controller.current.state.symbolLookup)
      .toEqual({ status: "unsupported", path: "docs/notes.md" });
  });

  it("shows the search diagnostic instead of an empty list", async () => {
    const diagnostic = {
      code: "SYMBOL_SEARCH_FAILED",
      message: "The symbol search could not run.",
      nextAction: "Build the result again, then retry the search.",
    };
    const { controller } = await reviewing({
      searchSymbol: vi.fn().mockResolvedValue({ status: "error", diagnostic }),
    });

    await act(() => controller.current.lookUpSymbol("UtVar", "references"));

    expect(controller.current.state.symbolLookup)
      .toEqual({ status: "error", symbol: "UtVar", diagnostic });
  });

  it("reports a broken boundary as a failure, not a crash", async () => {
    const { controller } = await reviewing({
      searchSymbol: vi.fn().mockRejectedValue(new Error("channel closed")),
    });

    await act(() => controller.current.lookUpSymbol("UtVar", "references"));

    expect(controller.current.state.symbolLookup).toMatchObject({
      status: "error",
      diagnostic: { code: "DESKTOP_CONNECTION_FAILED" },
    });
  });

  it("navigates to a hit and back again", async () => {
    const { controller } = await reviewing();
    act(() => { controller.current.goToHit("docs/notes.md", 1); });
    expect(controller.current.state.selectedFilePath).toBe("docs/notes.md");

    act(() => { controller.current.goBack(); });

    expect(controller.current.state.selectedFilePath).toBe("src/Caller.java");
  });

  it("does nothing without a result to search", async () => {
    const searchSymbol = vi.fn();
    const api = createApi({ searchSymbol });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `request-${String(++request)}`),
      { wrapper },
    );

    await act(() => result.current.lookUpSymbol("UtVar", "references"));

    expect(searchSymbol).not.toHaveBeenCalled();
    expect(result.current.state.symbolLookup).toEqual({ status: "idle" });
  });
});

describe("useAppController navigation outside the result", () => {
  const commitId = "d".repeat(40);
  const commonCommit = "c".repeat(40);
  const range = {
    baseRef: "main",
    baseRefCommit: session.branches[0]!.commitId,
    headRef: "main",
    headCommit: session.branches[0]!.commitId,
    baseCommit: commonCommit,
    rangeRevision: `${session.branches[0]!.commitId}:${session.branches[0]!.commitId}:${commonCommit}`,
  };

  async function reviewing(overrides: Partial<DesktopApi> = {}): Promise<{
    controller: { current: ReturnType<typeof useAppController> };
    api: DesktopApi;
  }> {
    const api = createApi({
      selectRepository: vi.fn().mockResolvedValue({ status: "success", data: session }),
      loadRange: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          range,
          page: {
            rangeRevision: range.rangeRevision,
            commits: [{
              id: commitId,
              shortId: commitId.slice(0, 7),
              parentIds: [commonCommit],
              title: "select me",
              authorName: "Prettifer Test",
              authoredAt: "2026-07-23T00:00:00.000Z",
              isMerge: false,
              selectable: true,
            }],
            nextOffset: null,
          },
        },
      }),
      composeSelection: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          baseCommit: commonCommit,
          selectedCommits: [commitId],
          files: [{
            path: "src/Caller.java",
            status: "modified",
            beforeContent: "class Caller {}",
            afterContent: "class Caller { UtVar value; }",
          }],
          mainlineParents: {},
          problemFiles: [],
          unifiedDiff: "diff",
        },
      }),
      ...overrides,
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `request-${String(++request)}`),
      { wrapper },
    );
    await act(() => result.current.openRepository());
    await act(() => result.current.loadRange("main", "main"));
    act(() => { result.current.toggleCommit(commitId); });
    await act(() => result.current.composeSelection());
    return { controller: result, api };
  }

  it("reads a file the selection never changed at the comparison base", async () => {
    const readBaseFile = vi.fn().mockResolvedValue({
      status: "success",
      data: { path: "src/UtVar.java", contents: "public class UtVar {}" },
    });
    const { controller } = await reviewing({ readBaseFile });

    await act(() => { controller.current.goToHit("src/UtVar.java", 12); return Promise.resolve(); });

    expect(readBaseFile).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      range,
      path: "src/UtVar.java",
    });
    expect(controller.current.state.externalFile).toEqual({
      status: "ready",
      path: "src/UtVar.java",
      contents: "public class UtVar {}",
    });
    expect(controller.current.state.revealLine).toBe(12);
  });

  it("does not read the base for a file the result already holds", async () => {
    const readBaseFile = vi.fn();
    const { controller } = await reviewing({ readBaseFile });

    act(() => { controller.current.goToHit("src/Caller.java", 3); });

    expect(readBaseFile).not.toHaveBeenCalled();
    expect(controller.current.state.externalFile).toEqual({ status: "idle" });
  });

  it("shows why a file could not be read instead of an empty editor", async () => {
    const diagnostic = {
      code: "BASE_FILE_BINARY",
      message: "That file is binary, so it has no text to review.",
      nextAction: "Open the file in a viewer for its format.",
    };
    const { controller } = await reviewing({
      readBaseFile: vi.fn().mockResolvedValue({ status: "error", diagnostic }),
    });

    await act(() => { controller.current.goToHit("docs/logo.png", 1); return Promise.resolve(); });

    expect(controller.current.state.externalFile)
      .toEqual({ status: "error", path: "docs/logo.png", diagnostic });
  });

  it("goes back into the result from a file outside it", async () => {
    const { controller } = await reviewing({
      readBaseFile: vi.fn().mockResolvedValue({
        status: "success",
        data: { path: "src/UtVar.java", contents: "public class UtVar {}" },
      }),
    });
    await act(() => { controller.current.goToHit("src/UtVar.java", 12); return Promise.resolve(); });

    act(() => { controller.current.goBack(); });

    expect(controller.current.state.selectedFilePath).toBe("src/Caller.java");
    expect(controller.current.state.externalFile).toEqual({ status: "idle" });
    expect(controller.current.state.navigationHistory).toEqual([]);
  });

  it("reads the base again when going back to a file outside the result", async () => {
    const readBaseFile = vi.fn().mockResolvedValue({
      status: "success",
      data: { path: "src/UtVar.java", contents: "public class UtVar {}" },
    });
    const { controller } = await reviewing({ readBaseFile });
    await act(() => { controller.current.goToHit("src/UtVar.java", 12); return Promise.resolve(); });
    act(() => { controller.current.goToHit("src/Caller.java", 3); });
    expect(controller.current.state.navigationHistory).toHaveLength(2);

    await act(() => { controller.current.goBack(); return Promise.resolve(); });

    expect(controller.current.state.selectedFilePath).toBe("src/UtVar.java");
    expect(controller.current.state.externalFile).toMatchObject({ status: "ready" });
    // Going back consumed the entry rather than adding another one.
    expect(controller.current.state.navigationHistory).toHaveLength(1);
    expect(readBaseFile).toHaveBeenCalledTimes(2);
  });
});
