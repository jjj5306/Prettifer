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
    listBaseTree: vi.fn().mockResolvedValue({
      status: "success",
      data: { paths: [], truncated: false },
    }),
    listFileHistory: vi.fn().mockResolvedValue({ status: "cancelled" }),
    readFileCommit: vi.fn().mockResolvedValue({ status: "cancelled" }),
    cancelFileHistory: vi.fn().mockResolvedValue({ status: "success", data: null }),
    readGroupingRules: vi.fn().mockResolvedValue({
      status: "success",
      data: { rules: [] },
    }),
    saveGroupingRules: vi.fn().mockResolvedValue({
      status: "success",
      data: { rules: [] },
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
              parents: [{ id: commonCommit, shortId: commonCommit.slice(0, 7), title: null }],
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
  const mdHit = {
    path: "docs/notes.md",
    line: 1,
    text: "UtVar is described here",
    kind: null,
  };
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
              parents: [{ id: commonCommit, shortId: commonCommit.slice(0, 7), title: null }],
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
          { path: "src/Caller.java", line: 1, text: "class Caller {}", kind: null },
          { path: "src/UtVar.java", line: 4, text: "class UtVar {}", kind: "type" },
        ],
        truncated: false,
      },
    });
    const { controller } = await reviewing({ searchSymbol });

    await act(() => controller.current.lookUpSymbol("UtVar", "references", "plain"));

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
      { path: "src/Caller.java", line: 1, text: "class Caller { UtVar value; }", kind: null },
      { path: "src/UtVar.java", line: 4, text: "class UtVar {}", kind: "type" },
    ]);
  });

  it("goes to the type, not its constructors, from a plain use", async () => {
    // What the user sees today for `UtVar`: a class and two constructors.
    const searchSymbol = vi.fn().mockResolvedValue({
      status: "success",
      data: {
        hits: [
          { path: "src/UtVar.java", line: 3, text: "public class UtVar {", kind: "type" },
          { path: "src/UtVar.java", line: 8, text: "    public UtVar() {", kind: "constructor" },
          { path: "src/UtVar.java", line: 12, text: "    public UtVar(int seed) {", kind: "constructor" },
        ],
        truncated: false,
      },
    });
    const { controller } = await reviewing({ searchSymbol });

    await act(() => controller.current.lookUpSymbol("UtVar", "definition", "plain"));

    // One candidate of the winning kind, so no list: it goes straight there.
    expect(controller.current.state.symbolLookup).toEqual({ status: "idle" });
    expect(controller.current.state.reveal).toMatchObject({ line: 3 });
  });

  it("offers the constructors where an object is being made", async () => {
    const searchSymbol = vi.fn().mockResolvedValue({
      status: "success",
      data: {
        hits: [
          { path: "src/UtVar.java", line: 3, text: "public class UtVar {", kind: "type" },
          { path: "src/UtVar.java", line: 8, text: "    public UtVar() {", kind: "constructor" },
          { path: "src/UtVar.java", line: 12, text: "    public UtVar(int seed) {", kind: "constructor" },
        ],
        truncated: false,
      },
    });
    const { controller } = await reviewing({ searchSymbol });

    await act(() => controller.current.lookUpSymbol("UtVar", "definition", "construction"));

    const lookup = controller.current.state.symbolLookup;
    if (lookup.status !== "ready") {
      throw new Error(`The lookup was ${lookup.status}.`);
    }
    // Overloads are a genuine choice, and the class line is not among them.
    expect(lookup.hits.map((hit) => hit.line)).toEqual([8, 12]);
  });

  it("keeps every match in a reference list, whatever its kind", async () => {
    const searchSymbol = vi.fn().mockResolvedValue({
      status: "success",
      data: {
        hits: [
          { path: "src/UtVar.java", line: 3, text: "public class UtVar {", kind: "type" },
          { path: "src/Other.java", line: 9, text: "        UtVar v = null;", kind: "variable" },
          { path: "src/Third.java", line: 2, text: "import model.UtVar;", kind: null },
        ],
        truncated: false,
      },
    });
    const { controller } = await reviewing({ searchSymbol });

    await act(() => controller.current.lookUpSymbol("UtVar", "references", "plain"));

    const lookup = controller.current.state.symbolLookup;
    if (lookup.status !== "ready") {
      throw new Error(`The lookup was ${lookup.status}.`);
    }
    // A type, a variable and a plain mention all survive; nothing is ranked out.
    expect(lookup.hits.map((hit) => `${hit.path}:${String(hit.kind)}`)).toEqual([
      "src/Caller.java:null",
      "src/Other.java:variable",
      "src/Third.java:null",
      "src/UtVar.java:type",
    ]);
  });

  it("reports an unsupported file without searching", async () => {
    const searchSymbol = vi.fn();
    const { controller } = await reviewing({ searchSymbol });
    act(() => { controller.current.selectFile("docs/notes.md"); });

    await act(() => controller.current.lookUpSymbol("UtVar", "references", "plain"));

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

    await act(() => controller.current.lookUpSymbol("UtVar", "references", "plain"));

    expect(controller.current.state.symbolLookup)
      .toEqual({ status: "error", symbol: "UtVar", diagnostic });
  });

  it("reports a broken boundary as a failure, not a crash", async () => {
    const { controller } = await reviewing({
      searchSymbol: vi.fn().mockRejectedValue(new Error("channel closed")),
    });

    await act(() => controller.current.lookUpSymbol("UtVar", "references", "plain"));

    expect(controller.current.state.symbolLookup).toMatchObject({
      status: "error",
      diagnostic: { code: "DESKTOP_CONNECTION_FAILED" },
    });
  });

  it("lands on the member, not at the start of its declaration line", async () => {
    const declaration = {
      path: "src/Caller.java",
      line: 3,
      text: "    private String UtUserCode;",
      kind: "field" as const,
    };
    const { controller } = await reviewing({
      searchSymbol: vi.fn().mockResolvedValue({
        status: "success",
        data: { hits: [declaration], truncated: false },
      }),
    });

    act(() => { controller.current.goToHit(declaration, "UtUserCode"); });

    expect(controller.current.state.reveal).toEqual({
      path: "src/Caller.java",
      line: 3,
      // `    private String UtUserCode;` puts the member at column 20.
      column: 20,
    });
  });

  it("skips a longer identifier that merely contains the symbol", async () => {
    const declaration = {
      path: "src/Caller.java",
      line: 4,
      text: "    int subtotal = total;",
      kind: "variable" as const,
    };
    const { controller } = await reviewing();

    act(() => { controller.current.goToHit(declaration, "total"); });

    // Column 20 is `total`, not the `total` inside `subtotal` at column 9.
    expect(controller.current.state.reveal).toMatchObject({ line: 4, column: 20 });
  });

  it("navigates to a hit and back again", async () => {
    const { controller } = await reviewing();
    act(() => { controller.current.goToHit(mdHit, "UtVar"); });
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

    await act(() => result.current.lookUpSymbol("UtVar", "references", "plain"));

    expect(searchSymbol).not.toHaveBeenCalled();
    expect(result.current.state.symbolLookup).toEqual({ status: "idle" });
  });
});

describe("useAppController navigation outside the result", () => {
  // Hits as the search would report them, so the column comes from real line text.
  const utVarHit = {
    path: "src/UtVar.java",
    line: 12,
    text: "    private String UtVar;",
    kind: "field" as const,
  };
  const callerHit = {
    path: "src/Caller.java",
    line: 3,
    text: "class Caller { UtVar value; }",
    kind: null,
  };
  const logoHit = {
    path: "docs/logo.png",
    line: 1,
    text: "",
    kind: null,
  };
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
              parents: [{ id: commonCommit, shortId: commonCommit.slice(0, 7), title: null }],
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

    await act(() => { controller.current.goToHit(utVarHit, "UtVar"); return Promise.resolve(); });

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
    expect(controller.current.state.reveal).toEqual({
      path: "src/UtVar.java",
      line: 12,
      // `private String UtVar;` puts the symbol at column 20, not at the margin.
      column: utVarHit.text.indexOf("UtVar") + 1,
    });
  });

  it("does not read the base for a file the result already holds", async () => {
    const readBaseFile = vi.fn();
    const { controller } = await reviewing({ readBaseFile });

    act(() => { controller.current.goToHit(callerHit, "UtVar"); });

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

    await act(() => { controller.current.goToHit(logoHit, "UtVar"); return Promise.resolve(); });

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
    await act(() => { controller.current.goToHit(utVarHit, "UtVar"); return Promise.resolve(); });

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
    await act(() => { controller.current.goToHit(utVarHit, "UtVar"); return Promise.resolve(); });
    act(() => { controller.current.goToHit(callerHit, "UtVar"); });
    expect(controller.current.state.navigationHistory).toHaveLength(2);

    await act(() => { controller.current.goBack(); return Promise.resolve(); });

    expect(controller.current.state.selectedFilePath).toBe("src/UtVar.java");
    expect(controller.current.state.externalFile).toMatchObject({ status: "ready" });
    // Going back consumed the entry rather than adding another one.
    expect(controller.current.state.navigationHistory).toHaveLength(1);
    expect(readBaseFile).toHaveBeenCalledTimes(2);
  });
});

describe("useAppController grouping rules", () => {
  const opened = async (overrides: Partial<DesktopApi> = {}) => {
    const api = createApi({
      openInitialRepository: vi.fn().mockResolvedValue({ status: "success", data: session }),
      ...overrides,
    });
    let request = 0;
    const { result } = renderHook(
      () => useAppController(api, () => `request-${String(++request)}`),
      { wrapper },
    );
    // The repository settles first, and only then does the rule read it starts.
    await act(() => Promise.resolve());
    await act(() => Promise.resolve());
    return { api, controller: result };
  };

  it("restores the rules of the repository it opened", async () => {
    const readGroupingRules = vi.fn().mockResolvedValue({
      status: "success",
      data: { rules: [{ prefix: "tests", name: "Tests" }] },
    });

    const { controller } = await opened({ readGroupingRules });

    expect(readGroupingRules).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
    });
    expect(controller.current.state.groupingRules).toEqual({
      status: "ready",
      rules: [{ prefix: "tests", name: "Tests" }],
      saveDiagnostic: null,
    });
  });

  it("does not read the settings again when the screen re-renders", async () => {
    const readGroupingRules = vi.fn().mockResolvedValue({
      status: "success",
      data: { rules: [] },
    });
    const { controller } = await opened({ readGroupingRules });
    const reads = readGroupingRules.mock.calls.length;

    act(() => { controller.current.selectFile("src/app.ts"); });
    await act(() => Promise.resolve());

    expect(readGroupingRules).toHaveBeenCalledTimes(reads);
  });

  it("reports a settings file it could not read", async () => {
    const diagnostic = {
      code: "GROUPING_RULES_UNREADABLE",
      message: "The saved grouping rules are not in a form Prettifer understands.",
      subject: "Group rules",
      nextAction: "Fix or remove the grouping rules file, then reopen the repository.",
    };

    const { controller } = await opened({
      listBaseTree: vi.fn().mockResolvedValue({
      status: "success",
      data: { paths: [], truncated: false },
    }),
    readGroupingRules: vi.fn().mockResolvedValue({ status: "error", diagnostic }),
    });

    expect(controller.current.state.groupingRules).toEqual({ status: "error", diagnostic });
  });

  it("saves an edited rule list for the open repository", async () => {
    const saveGroupingRules = vi.fn().mockResolvedValue({
      status: "success",
      data: { rules: [] },
    });
    const { controller } = await opened({ saveGroupingRules });
    const rules = [{ prefix: "tests", name: "Tests" }];

    await act(() => controller.current.saveGroupingRules(rules));

    expect(saveGroupingRules).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      rules,
    });
    expect(controller.current.state.groupingRules).toEqual({
      status: "ready",
      rules,
      saveDiagnostic: null,
    });
  });

  it("keeps the edit on screen when the settings file refused the save", async () => {
    const diagnostic = {
      code: "GROUPING_RULES_WRITE_FAILED",
      message: "Prettifer could not save the grouping rules.",
      subject: "Group rules",
      nextAction: "Check that Prettifer can write to its settings folder, then save again.",
    };
    const { controller } = await opened({
      saveGroupingRules: vi.fn().mockResolvedValue({ status: "error", diagnostic }),
    });
    const rules = [{ prefix: "tests", name: "Tests" }];

    await act(() => controller.current.saveGroupingRules(rules));

    expect(controller.current.state.groupingRules).toEqual({
      status: "ready",
      rules,
      saveDiagnostic: diagnostic,
    });
  });
});

describe("useAppController base tree", () => {
  const commitId = "d".repeat(40);
  const commonCommit = "c".repeat(40);
  const tip = session.branches[0]!.commitId;
  const range = {
    baseRef: "main",
    baseRefCommit: tip,
    headRef: "main",
    headCommit: tip,
    baseCommit: commonCommit,
    rangeRevision: `${tip}:${tip}:${commonCommit}`,
  };

  /** Drives the controller to a finished result, ready to be reviewed. */
  async function reviewing(overrides: Partial<DesktopApi> = {}) {
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
              parents: [{ id: commonCommit, shortId: commonCommit.slice(0, 7), title: null }],
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
            path: "src/app.ts",
            status: "modified",
            beforeContent: "before",
            afterContent: "after",
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

  it("reads the path list for the range under review", async () => {
    const listBaseTree = vi.fn().mockResolvedValue({
      status: "success",
      data: { paths: ["README.md", "src/app.ts"], truncated: false },
    });
    const { controller } = await reviewing({ listBaseTree });

    await act(() => controller.current.loadBaseTree());

    expect(listBaseTree).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      range,
    });
    expect(controller.current.state.baseTree).toEqual({
      status: "ready",
      rangeRevision: range.rangeRevision,
      paths: ["README.md", "src/app.ts"],
      truncated: false,
    });
  });

  it("does not read the path list twice for one range", async () => {
    const listBaseTree = vi.fn().mockResolvedValue({
      status: "success",
      data: { paths: [], truncated: false },
    });
    const { controller } = await reviewing({ listBaseTree });

    await act(() => controller.current.loadBaseTree());
    await act(() => controller.current.loadBaseTree());

    expect(listBaseTree).toHaveBeenCalledOnce();
  });

  it("loads history for the selected changed file", async () => {
    const listFileHistory = vi.fn().mockResolvedValue({
      status: "success",
      data: {
        rangeRevision: range.rangeRevision,
        path: "src/app.ts",
        entries: [],
        nextOffset: null,
        partial: null,
      },
    });
    const { controller } = await reviewing({ listFileHistory });
    await act(() => controller.current.loadFileHistory());

    expect(listFileHistory).toHaveBeenCalledWith(expect.objectContaining({
      path: "src/app.ts",
      range,
      offset: 0,
    }));
    expect(controller.current.state.fileHistory).toMatchObject({
      status: "ready",
      path: "src/app.ts",
    });
  });

  it("keeps the path list when the result is calculated again", async () => {
    const listBaseTree = vi.fn().mockResolvedValue({
      status: "success",
      data: { paths: ["README.md"], truncated: false },
    });
    const { controller } = await reviewing({ listBaseTree });
    await act(() => controller.current.loadBaseTree());

    await act(() => controller.current.composeSelection());
    await act(() => controller.current.loadBaseTree());

    expect(listBaseTree).toHaveBeenCalledOnce();
    expect(controller.current.state.baseTree).toMatchObject({ status: "ready" });
  });

  it("drops the path list when the comparison range is loaded again", async () => {
    const listBaseTree = vi.fn().mockResolvedValue({
      status: "success",
      data: { paths: ["README.md"], truncated: false },
    });
    const { controller } = await reviewing({ listBaseTree });
    await act(() => controller.current.loadBaseTree());

    await act(() => controller.current.loadRange("main", "main"));

    expect(controller.current.state.baseTree).toEqual({ status: "idle" });
    await act(() => controller.current.loadBaseTree());
    expect(listBaseTree).toHaveBeenCalledTimes(2);
  });

  it("reports a failed listing and leaves the result alone", async () => {
    const diagnostic = {
      code: "BASE_TREE_LIST_FAILED",
      message: "The repository file list could not be read.",
      subject: "Repository tree",
      nextAction: "Reload the comparison range, then open Full Tree again.",
    };
    const { controller } = await reviewing({
      listBaseTree: vi.fn().mockResolvedValue({ status: "error", diagnostic }),
    });

    await act(() => controller.current.loadBaseTree());

    expect(controller.current.state.baseTree).toEqual({
      status: "error",
      rangeRevision: range.rangeRevision,
      diagnostic,
    });
    expect(controller.current.state.composition).toMatchObject({ status: "ready" });
  });

  it("reads a file the result never changed when it is selected", async () => {
    const readBaseFile = vi.fn().mockResolvedValue({
      status: "success",
      data: { path: "README.md", contents: "# Prettifer" },
    });
    const { controller } = await reviewing({ readBaseFile });

    await act(() => { controller.current.selectFile("README.md"); return Promise.resolve(); });

    expect(readBaseFile).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      range,
      path: "README.md",
    });
    expect(controller.current.state.externalFile).toEqual({
      status: "ready",
      path: "README.md",
      contents: "# Prettifer",
    });
  });

  it("does not read the comparison base for a file the result holds", async () => {
    const readBaseFile = vi.fn();
    const { controller } = await reviewing({ readBaseFile });

    act(() => { controller.current.selectFile("src/app.ts"); });

    expect(readBaseFile).not.toHaveBeenCalled();
    expect(controller.current.state.selectedFilePath).toBe("src/app.ts");
  });
});
