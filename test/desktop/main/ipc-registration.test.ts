import { describe, expect, it, vi } from "vitest";

import {
  registerDesktopRequestHandlers,
  removeDesktopRequestHandlers,
} from "../../../src/desktop/main/ipc-registration.js";
import { DESKTOP_CHANNELS } from "../../../src/desktop/shared/index.js";

describe("desktop IPC registration", () => {
  it("registers and removes only the named desktop channels", () => {
    const handledChannels: string[] = [];
    const removedChannels: string[] = [];
    const ipcMain = {
      handle: vi.fn((channel: string) => {
        handledChannels.push(channel);
      }),
      removeHandler: vi.fn((channel: string) => {
        removedChannels.push(channel);
      }),
    };
    const handler = vi.fn().mockResolvedValue({ status: "cancelled" });
    const handlers = {
      selectRepository: handler,
      openInitialRepository: handler,
      searchSymbol: handler,
      loadRange: handler,
      listCommits: handler,
      composeSelection: handler,
      cancelComposition: handler,
      readBaseFile: handler,
      listBaseTree: handler,
      listFileHistory: handler,
      readFileCommit: handler,
      cancelFileHistory: handler,
      readGroupingRules: handler,
      saveGroupingRules: handler,
      readAppInfo: handler,
    };

    registerDesktopRequestHandlers(ipcMain, handlers);
    expect(handledChannels).toEqual(Object.values(DESKTOP_CHANNELS));
    expect(removedChannels).toEqual(Object.values(DESKTOP_CHANNELS));

    removedChannels.length = 0;
    removeDesktopRequestHandlers(ipcMain);
    expect(removedChannels).toEqual(Object.values(DESKTOP_CHANNELS));
  });

  it("passes only sender identity, frame URL and request data to handlers", async () => {
    const registered = new Map<string, (...parameters: unknown[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, listener: (...parameters: unknown[]) => unknown) => {
        registered.set(channel, listener);
      }),
      removeHandler: vi.fn(),
    };
    const loadRange = vi.fn().mockResolvedValue({ status: "cancelled" });
    registerDesktopRequestHandlers(ipcMain, {
      selectRepository: vi.fn(),
      openInitialRepository: vi.fn(),
      searchSymbol: vi.fn(),
      loadRange,
      listCommits: vi.fn(),
      composeSelection: vi.fn(),
      cancelComposition: vi.fn(),
      readBaseFile: vi.fn(),
      listBaseTree: vi.fn(),
      listFileHistory: vi.fn(),
      readFileCommit: vi.fn(),
      cancelFileHistory: vi.fn(),
      readGroupingRules: vi.fn(),
      saveGroupingRules: vi.fn(),
      readAppInfo: vi.fn(),
    });
    const input = {
      repositorySessionId: "00000000-0000-4000-8000-000000000001",
      sessionRevision: 1,
      baseRef: "main",
      headRef: "feature/ui",
    };
    const event = {
      sender: { id: 31 },
      senderFrame: { url: "file:///C:/app/index.html" },
    };

    await registered.get(DESKTOP_CHANNELS.loadRange)?.(event, input);
    expect(loadRange).toHaveBeenCalledWith({
      senderId: 31,
      frameUrl: "file:///C:/app/index.html",
    }, input);
  });
});
