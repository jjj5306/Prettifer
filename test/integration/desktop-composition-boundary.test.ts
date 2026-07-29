import { afterEach, describe, expect, it } from "vitest";

import { CompositeDiffCoordinator } from "../../src/composition/composite-diff-coordinator.js";
import { CompositeDiffService } from "../../src/composition/composite-diff-service.js";
import { DesktopCompositionController } from "../../src/desktop/main/desktop-composition-controller.js";
import type { CompositionRequest } from "../../src/desktop/shared/index.js";
import {
  GitCommandAbortedError,
  GitCommandRunner,
  NodeProcessExecutor,
  type ProcessExecutor,
  type ProcessRequest,
} from "../../src/git/git-command-runner.js";
import { RepositoryHistoryService } from "../../src/history/repository-history-service.js";
import {
  createAuthHistoryFixture,
  type GitFixture,
} from "../support/git-fixture.js";

describe("desktop composition boundary worktree preservation", () => {
  let fixture: GitFixture | undefined;

  afterEach(async () => {
    await fixture?.dispose();
  });

  it("preserves all user Git state after screen-boundary success, failure and cancellation", async () => {
    fixture = await createAuthHistoryFixture();
    await fixture.prepareDirtyWorktree();
    const before = await fixture.snapshotWorktree();
    const history = new RepositoryHistoryService();
    const range = await history.createRange({
      repositoryPath: fixture.path,
      baseRef: fixture.baseRef,
      headRef: fixture.headRef,
    });
    const controller = new DesktopCompositionController(
      history,
      new CompositeDiffCoordinator(new CompositeDiffService()),
    );
    const request = createRequest(range, fixture.commits.validateLogin);

    await expect(controller.compose(request, fixture.path)).resolves.toMatchObject({
      status: "success",
    });
    await expect(fixture.snapshotWorktree()).resolves.toEqual(before);

    await expect(controller.compose({
      ...request,
      requestId: "00000000-0000-4000-8000-000000000003",
      selectedCommits: [fixture.commits.base],
    }, fixture.path)).resolves.toMatchObject({
      status: "error",
    });
    await expect(fixture.snapshotWorktree()).resolves.toEqual(before);

    let markCherryPickStarted: (() => void) | undefined;
    const cherryPickStarted = new Promise<void>((resolve) => {
      markCherryPickStarted = resolve;
    });
    const delegate = new NodeProcessExecutor();
    const executor: ProcessExecutor = {
      execute(processRequest: ProcessRequest) {
        if (!processRequest.args.includes("cherry-pick")) {
          return delegate.execute(processRequest);
        }
        markCherryPickStarted?.();
        return new Promise((_resolve, reject) => {
          const abort = (): void => { reject(new GitCommandAbortedError()); };
          if (processRequest.signal?.aborted === true) {
            abort();
          } else {
            processRequest.signal?.addEventListener("abort", abort, { once: true });
          }
        });
      },
    };
    const cancellingController = new DesktopCompositionController(
      history,
      new CompositeDiffCoordinator(
        new CompositeDiffService(new GitCommandRunner({ executor })),
      ),
    );
    const cancellationRequest = {
      ...request,
      requestId: "00000000-0000-4000-8000-000000000004",
    };
    const cancelled = cancellingController.compose(cancellationRequest, fixture.path);
    await cherryPickStarted;
    expect(cancellingController.cancel({
      repositorySessionId: cancellationRequest.repositorySessionId,
      sessionRevision: cancellationRequest.sessionRevision,
      requestId: cancellationRequest.requestId,
    })).toEqual({ status: "success", data: null });
    await expect(cancelled).resolves.toEqual({ status: "cancelled" });
    await expect(fixture.snapshotWorktree()).resolves.toEqual(before);
    expect(fixture.git(["worktree", "list", "--porcelain"]))
      .not.toContain("prettifer-composition-");
  });
});

function createRequest(
  range: Awaited<ReturnType<RepositoryHistoryService["createRange"]>>,
  selectedCommit: string,
): CompositionRequest {
  return {
    repositorySessionId: "00000000-0000-4000-8000-000000000001",
    sessionRevision: 1,
    range: {
      baseRef: range.baseRef,
      baseRefCommit: range.baseRefCommit,
      headRef: range.headRef,
      headCommit: range.headCommit,
      baseCommit: range.baseCommit,
      rangeRevision: range.revision,
    },
    requestId: "00000000-0000-4000-8000-000000000002",
    selectedCommits: [selectedCommit],
    mainlineParents: {},
  };
}
