import { describe, expect, it, vi } from "vitest";

import { DesktopCompositionController } from "../../../src/desktop/main/desktop-composition-controller.js";
import type { CompositionRequest } from "../../../src/desktop/shared/index.js";
import { RepositoryHistoryError } from "../../../src/history/repository-history-service.js";

const baseCommit = "a".repeat(40);
const headCommit = "b".repeat(40);
const commonCommit = "c".repeat(40);
const selectedCommit = "d".repeat(40);
const request: CompositionRequest = {
  repositorySessionId: "00000000-0000-4000-8000-000000000001",
  sessionRevision: 1,
  range: {
    baseRef: "main",
    baseRefCommit: baseCommit,
    headRef: "feature/ui",
    headCommit,
    baseCommit: commonCommit,
    rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
  },
  requestId: "00000000-0000-4000-8000-000000000002",
  mainlineParents: {},
  selectedCommits: [selectedCommit],
};
const readyState = {
  status: "ready" as const,
  selectedCommits: [selectedCommit],
  result: {
    baseCommit: commonCommit,
    selectedCommits: [selectedCommit],
    files: [],
    mainlineParents: {},
    unifiedDiff: "",
  },
};

function deferredSignal(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve: () => { resolve?.(); } };
}

describe("DesktopCompositionController", () => {
  it("validates the fixed range and connects the repository session path to the coordinator", async () => {
    const history = { assertCompositionInput: vi.fn().mockResolvedValue(undefined) };
    const coordinator = {
      update: vi.fn().mockResolvedValue(readyState),
      cancel: vi.fn(),
    };
    const controller = new DesktopCompositionController(history, coordinator);

    await expect(controller.compose(request, "C:\\work\\repo")).resolves.toEqual({
      status: "success",
      data: readyState.result,
    });
    expect(history.assertCompositionInput).toHaveBeenCalledWith({
      repositoryPath: "C:\\work\\repo",
      range: {
        baseRef: request.range.baseRef,
        baseRefCommit: baseCommit,
        headRef: request.range.headRef,
        headCommit,
        baseCommit: commonCommit,
        revision: request.range.rangeRevision,
      },
      selectedCommits: request.selectedCommits,
    });
    expect(coordinator.update).toHaveBeenCalledWith({
      repositoryPath: "C:\\work\\repo",
      baseRef: commonCommit,
      headRef: headCommit,
      selectedCommits: [selectedCommit],
      mainlineParents: {},
    });
  });

  it("rejects a moved branch before composition starts", async () => {
    const history = {
      assertCompositionInput: vi.fn().mockRejectedValue(new RepositoryHistoryError(
        "RANGE_STALE",
        "feature/ui",
        "Reload the branch history, then select the commits again.",
      )),
    };
    const coordinator = { update: vi.fn(), cancel: vi.fn() };
    const controller = new DesktopCompositionController(history, coordinator);

    await expect(controller.compose(request, "C:\\work\\repo")).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "RANGE_STALE" },
    });
    expect(coordinator.update).not.toHaveBeenCalled();
  });

  it("maps known selection errors and hides internal composition failures", async () => {
    const selectionController = new DesktopCompositionController(
      { assertCompositionInput: vi.fn().mockResolvedValue(undefined) },
      {
        update: vi.fn().mockResolvedValue({
          status: "error",
          selectedCommits: [selectedCommit],
          diagnostic: {
            code: "INVALID_COMMIT",
            message: "The commit could not be found.",
            commit: selectedCommit,
            nextAction: "Review the selection.",
          },
        }),
        cancel: vi.fn(),
      },
    );
    await expect(selectionController.compose(request, "C:\\work\\repo")).resolves.toMatchObject({
      status: "error",
      diagnostic: { code: "INVALID_COMMIT", subject: selectedCommit },
    });

    const secret = "C:\\Users\\secret\\prettifer-worktree git stderr";
    const failureController = new DesktopCompositionController(
      { assertCompositionInput: vi.fn().mockResolvedValue(undefined) },
      {
        update: vi.fn().mockResolvedValue({
          status: "error",
          selectedCommits: [selectedCommit],
          diagnostic: {
            code: "COMPOSITION_FAILED",
            message: secret,
            nextAction: "raw command",
          },
        }),
        cancel: vi.fn(),
      },
    );
    const result = await failureController.compose(request, "C:\\work\\repo");
    expect(result).toEqual({
      status: "error",
      diagnostic: {
        code: "COMPOSITION_FAILED",
        message: "The selected result could not be calculated.",
        nextAction: "Check the repository and selected commits, then try again.",
      },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("publishes an actionable prerequisite diagnostic without Git internals", async () => {
    const controller = new DesktopCompositionController(
      { assertCompositionInput: vi.fn().mockResolvedValue(undefined) },
      {
        update: vi.fn().mockResolvedValue({
          status: "error",
          selectedCommits: [selectedCommit],
          diagnostic: {
            code: "COMMIT_APPLY_CONFLICT",
            message: "The commit cannot be applied independently.",
            commit: selectedCommit,
            nextAction: "Select its earlier prerequisite commits, then try again.",
          },
        }),
        cancel: vi.fn(),
      },
    );

    await expect(controller.compose(request, "C:\\work\\repo")).resolves.toEqual({
      status: "error",
      diagnostic: {
        code: "COMMIT_APPLY_CONFLICT",
        message: "The commit cannot be applied independently.",
        subject: selectedCommit,
        nextAction: "Select its earlier prerequisite commits, then try again.",
      },
    });
  });

  it.each([
    {
      code: "REPOSITORY_LOCKED",
      message: "The repository is busy with another Git operation.",
      nextAction: "Wait for other Git operations to finish, then try again.",
    },
    {
      code: "REPOSITORY_PERMISSION_DENIED",
      message: "The selected result could not access the repository workspace.",
      nextAction: "Check repository and temporary-folder permissions, then try again.",
    },
    {
      code: "INSUFFICIENT_STORAGE",
      message: "The selected result could not be built because available storage is insufficient.",
      nextAction: "Free storage space on the repository or system drive, then try again.",
    },
  ])("publishes the safe $code diagnostic", async (diagnostic) => {
    const controller = new DesktopCompositionController(
      { assertCompositionInput: vi.fn().mockResolvedValue(undefined) },
      {
        update: vi.fn().mockResolvedValue({
          status: "error",
          selectedCommits: [selectedCommit],
          diagnostic,
        }),
        cancel: vi.fn(),
      },
    );

    await expect(controller.compose(request, "C:\\work\\repo")).resolves.toEqual({
      status: "error",
      diagnostic,
    });
  });

  it("redacts an unrecognized coordinator diagnostic", async () => {
    const secret = "C:\\Users\\secret\\prettifer-worktree";
    const controller = new DesktopCompositionController(
      { assertCompositionInput: vi.fn().mockResolvedValue(undefined) },
      {
        update: vi.fn().mockResolvedValue({
          status: "error",
          selectedCommits: [selectedCommit],
          diagnostic: {
            code: "FUTURE_INTERNAL_FAILURE",
            message: secret,
            nextAction: secret,
          },
        }),
        cancel: vi.fn(),
      },
    );

    const result = await controller.compose(request, "C:\\work\\repo");

    expect(result).toEqual({
      status: "error",
      diagnostic: {
        code: "COMPOSITION_FAILED",
        message: "The selected result could not be calculated.",
        nextAction: "Check the repository and selected commits, then try again.",
      },
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("publishes only the newest request when an older validation finishes late", async () => {
    const validation = deferredSignal();
    const history = {
      assertCompositionInput: vi.fn().mockReturnValue(validation.promise),
    };
    const coordinator = {
      update: vi.fn().mockResolvedValue(readyState),
      cancel: vi.fn(),
    };
    const controller = new DesktopCompositionController(history, coordinator);
    const oldResult = controller.compose(request, "C:\\work\\repo");
    const newestRequest = {
      ...request,
      requestId: "00000000-0000-4000-8000-000000000003",
    };
    const newestResult = controller.compose(newestRequest, "C:\\work\\repo");

    await Promise.resolve();
    validation.resolve();
    await expect(newestResult).resolves.toMatchObject({ status: "success" });
    await expect(oldResult).resolves.toEqual({ status: "cancelled" });
    expect(coordinator.update).toHaveBeenCalledOnce();
  });

  it("cancels only the matching active request and cleans it up", async () => {
    const validation = deferredSignal();
    const coordinator = {
      update: vi.fn().mockResolvedValue(readyState),
      cancel: vi.fn(),
    };
    const controller = new DesktopCompositionController(
      { assertCompositionInput: vi.fn().mockReturnValue(validation.promise) },
      coordinator,
    );
    const result = controller.compose(request, "C:\\work\\repo");

    expect(controller.cancel({
      repositorySessionId: request.repositorySessionId,
      sessionRevision: request.sessionRevision,
      requestId: request.requestId,
    })).toEqual({ status: "success", data: null });
    expect(coordinator.cancel).toHaveBeenCalledOnce();
    validation.resolve();
    await expect(result).resolves.toEqual({ status: "cancelled" });

    expect(controller.cancel({
      repositorySessionId: request.repositorySessionId,
      sessionRevision: request.sessionRevision,
      requestId: request.requestId,
    })).toMatchObject({ status: "error", diagnostic: { code: "REQUEST_EXPIRED" } });
  });

  it("cancels and clears active work when the window is disposed", () => {
    const coordinator = { update: vi.fn(), cancel: vi.fn() };
    const controller = new DesktopCompositionController(
      { assertCompositionInput: vi.fn() },
      coordinator,
    );
    controller.dispose();
    expect(coordinator.cancel).toHaveBeenCalledOnce();
  });
});
