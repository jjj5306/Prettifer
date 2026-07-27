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
    loadRange: vi.fn().mockResolvedValue({ status: "error", diagnostic: {
      code: "NO_RANGE",
      message: "범위가 없습니다.",
      nextAction: "브랜치를 선택해 주세요.",
    } }),
    listCommits: vi.fn().mockResolvedValue({ status: "error", diagnostic: {
      code: "NO_PAGE",
      message: "페이지가 없습니다.",
      nextAction: "범위를 다시 불러와 주세요.",
    } }),
    composeSelection: vi.fn().mockResolvedValue({ status: "cancelled" }),
    cancelComposition: vi.fn().mockResolvedValue({ status: "success", data: null }),
    ...overrides,
  };
}

const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;

describe("useAppController", () => {
  it("loads a selected repository from a user action", async () => {
    const api = createApi({
      selectRepository: vi.fn().mockResolvedValue({ status: "success", data: session }),
    });
    const { result } = renderHook(
      () => useAppController(api, () => "repository-request"),
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
        message: "Git 저장소를 열 수 없습니다.",
        subject: "C:\\work\\plain",
        nextAction: "다른 폴더를 선택해 주세요.",
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
    const { result } = renderHook(
      () => useAppController(api, () => "repository-request"),
      { wrapper },
    );

    await expect(act(() => result.current.openRepository())).resolves.toBeUndefined();
    expect(result.current.state.repository).toMatchObject({
      status: "error",
      diagnostic: {
        code: "DESKTOP_CONNECTION_FAILED",
        nextAction: "앱 창을 다시 연 뒤 시도해 주세요.",
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

    act(() => { result.current.toggleCommit(commitId); });
    expect(cancelComposition).toHaveBeenCalledWith({
      repositorySessionId: session.repositorySessionId,
      sessionRevision: session.sessionRevision,
      requestId: "request-3",
    });
    expect(result.current.state.composition).toEqual({ status: "idle" });
  });
});
