import { describe, expect, it, vi } from "vitest";

import {
  RepositorySessionController,
  RepositorySessionError,
  RepositorySessionManager,
} from "../../../src/desktop/main/repository-session.js";
import { RepositoryHistoryError } from "../../../src/history/repository-history-service.js";

const repository = {
  rootPath: "C:\\work\\repo",
  currentBranch: "main",
  branches: [{ name: "main", commitId: "a".repeat(40), isCurrent: true }],
};

describe("RepositorySessionManager", () => {
  it("normalizes a valid repository and replaces the previous session", async () => {
    const getRepository = vi
      .fn()
      .mockResolvedValueOnce(repository)
      .mockResolvedValueOnce({ ...repository, rootPath: "C:\\work\\other" });
    const manager = new RepositorySessionManager(
      { getRepository },
      (path) => path.replace(/\\+$/u, ""),
      (() => {
        let sequence = 0;
        return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
      })(),
    );

    const first = await manager.open("C:\\work\\repo\\");
    const second = await manager.open("C:\\work\\other\\");

    expect(getRepository).toHaveBeenNthCalledWith(1, "C:\\work\\repo");
    expect(first.sessionRevision).toBe(1);
    expect(second.sessionRevision).toBe(2);
    expect(manager.require(second.repositorySessionId, 2).rootPath).toBe("C:\\work\\other");
    expect(() => manager.require(first.repositorySessionId, 1)).toThrow(RepositorySessionError);
  });

  it("keeps the current session when a new folder is invalid", async () => {
    const getRepository = vi
      .fn()
      .mockResolvedValueOnce(repository)
      .mockRejectedValueOnce(new RepositoryHistoryError(
        "INVALID_REPOSITORY",
        "C:\\work\\plain",
        "Choose another Git repository folder.",
      ));
    const manager = new RepositorySessionManager(
      { getRepository },
      (path) => path,
      () => "00000000-0000-4000-8000-000000000001",
    );
    const current = await manager.open(repository.rootPath);

    await expect(manager.open("C:\\work\\plain")).rejects.toThrow(RepositoryHistoryError);
    expect(manager.require(current.repositorySessionId, current.sessionRevision)).toEqual(current);
  });

  it("rejects expired session and revision identities", async () => {
    const manager = new RepositorySessionManager(
      { getRepository: vi.fn().mockResolvedValue(repository) },
      (path) => path,
      () => "00000000-0000-4000-8000-000000000001",
    );
    const current = await manager.open(repository.rootPath);

    expect(() => manager.require("00000000-0000-4000-8000-000000000002", 1)).toThrow(
      expect.objectContaining({ code: "SESSION_EXPIRED" }),
    );
    expect(() => manager.require(current.repositorySessionId, 2)).toThrow(
      expect.objectContaining({ code: "SESSION_EXPIRED" }),
    );
  });
});

describe("RepositorySessionController", () => {
  it("preserves the current session when folder selection is cancelled", async () => {
    const manager = new RepositorySessionManager(
      { getRepository: vi.fn().mockResolvedValue(repository) },
      (path) => path,
      () => "00000000-0000-4000-8000-000000000001",
    );
    const current = await manager.open(repository.rootPath);
    const controller = new RepositorySessionController(manager, {
      selectFolder: vi.fn().mockResolvedValue(null),
    });

    await expect(controller.selectRepository()).resolves.toEqual({ status: "cancelled" });
    expect(manager.require(current.repositorySessionId, current.sessionRevision)).toEqual(current);
  });

  it("returns an actionable diagnostic for an invalid folder", async () => {
    const manager = new RepositorySessionManager(
      {
        getRepository: vi.fn().mockRejectedValue(new RepositoryHistoryError(
          "INVALID_REPOSITORY",
          "C:\\work\\plain",
          "Choose another Git repository folder.",
        )),
      },
      (path) => path,
      () => "00000000-0000-4000-8000-000000000001",
    );
    const controller = new RepositorySessionController(manager, {
      selectFolder: vi.fn().mockResolvedValue("C:\\work\\plain"),
    });

    await expect(controller.selectRepository()).resolves.toEqual({
      status: "error",
      diagnostic: {
        code: "INVALID_REPOSITORY",
        message: "The Git repository could not be opened: C:\\work\\plain",
        subject: "C:\\work\\plain",
        nextAction: "Choose another Git repository folder.",
      },
    });
  });
});
