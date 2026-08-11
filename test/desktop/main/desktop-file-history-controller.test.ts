import { describe, expect, it, vi } from "vitest";

import { DesktopFileHistoryController } from "../../../src/desktop/main/desktop-file-history-controller.js";
import {
  FileHistoryError,
  type FileHistoryPage,
} from "../../../src/history/file-history-service.js";

const repositorySessionId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const baseRefCommit = "a".repeat(40);
const headCommit = "b".repeat(40);
const baseCommit = "c".repeat(40);
const range = {
  baseRef: "main",
  baseRefCommit,
  headRef: "feature/history",
  headCommit,
  baseCommit,
  rangeRevision: `${baseRefCommit}:${headCommit}:${baseCommit}`,
};
const request = {
  repositorySessionId,
  sessionRevision: 1,
  range,
  requestId,
  path: "src/app.ts",
  offset: 0,
};

describe("DesktopFileHistoryController", () => {
  it("validates the live range and returns a detached history page", async () => {
    const assertRangeCurrent = vi.fn().mockResolvedValue(undefined);
    const list = vi.fn().mockResolvedValue({
      rangeRevision: range.rangeRevision,
      path: request.path,
      entries: [{
        id: "d".repeat(40),
        shortId: "ddddddd",
        parents: [baseCommit],
        title: "feat: change app",
        authorName: "Reviewer",
        authoredAt: "2025-01-01T00:00:00.000Z",
        status: "modified",
        path: request.path,
      }],
      nextOffset: null,
      partial: null,
    });
    const controller = new DesktopFileHistoryController(
      { assertRangeCurrent },
      { list, readCommit: vi.fn() },
    );

    await expect(controller.list(request, "C:\\work\\repo")).resolves.toMatchObject({
      status: "success",
      data: { path: request.path, entries: [{ id: "d".repeat(40) }] },
    });
    expect(assertRangeCurrent).toHaveBeenCalledWith(expect.objectContaining({
      repositoryPath: "C:\\work\\repo",
      range: expect.objectContaining({ revision: range.rangeRevision }),
    }));
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      headCommit,
      rangeRevision: range.rangeRevision,
      path: request.path,
      offset: 0,
    }));
  });

  it("keeps an unresolved selected merge as an actionable diagnostic", async () => {
    const controller = new DesktopFileHistoryController(
      { assertRangeCurrent: vi.fn().mockResolvedValue(undefined) },
      {
        list: vi.fn(),
        readCommit: vi.fn().mockRejectedValue(new FileHistoryError(
          "MAINLINE_PARENT_REQUIRED",
          "d".repeat(40),
          "Choose the merge mainline parent.",
        )),
      },
    );

    await expect(controller.readCommit({
      ...request,
      commitId: "d".repeat(40),
      selected: true,
    }, "C:\\work\\repo")).resolves.toMatchObject({
      status: "error",
      diagnostic: {
        code: "MAINLINE_PARENT_REQUIRED",
        nextAction: "Choose the merge mainline parent.",
      },
    });
  });

  it("aborts an active read and discards its late result", async () => {
    const list = vi.fn(async ({ signal }: { signal?: AbortSignal }) => await new Promise<FileHistoryPage>((resolve) => {
      signal?.addEventListener("abort", () => {
        resolve({
          rangeRevision: range.rangeRevision,
          path: request.path,
          entries: [],
          nextOffset: null,
          partial: null,
        });
      }, { once: true });
    }));
    const controller = new DesktopFileHistoryController(
      { assertRangeCurrent: vi.fn().mockResolvedValue(undefined) },
      { list, readCommit: vi.fn() },
    );
    const pending = controller.list(request, "C:\\work\\repo");
    await vi.waitFor(() => { expect(list).toHaveBeenCalledOnce(); });

    expect(controller.cancel({ repositorySessionId, sessionRevision: 1, requestId }))
      .toEqual({ status: "success", data: null });
    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });
});
