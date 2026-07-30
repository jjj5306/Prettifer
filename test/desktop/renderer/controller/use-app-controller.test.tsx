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
          code: "NOT_A_REPOSITORY",
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
      diagnostic: { code: "NOT_A_REPOSITORY", subject: "C:\\work\\plain" },
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
