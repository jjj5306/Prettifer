import { describe, expect, it, vi } from "vitest";

import {
  startDesktopApplication,
  type ApplicationHost,
  type ApplicationWindow,
} from "../../../src/desktop/main/desktop-application.js";
import { DESKTOP_CHANNELS } from "../../../src/desktop/shared/index.js";

const entryUrl = "http://localhost:3000/main_window";

interface Harness {
  readonly host: ApplicationHost;
  readonly window: FakeWindow;
  readonly handled: Map<string, (...args: never[]) => unknown>;
  readonly removed: string[];
  emit(event: "ready-to-show" | "closed"): void;
}

class FakeWindow implements ApplicationWindow {
  readonly webContents = {
    id: 7,
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
  };
  readonly show = vi.fn();
  readonly destroy = vi.fn(() => {
    this.destroyed = true;
    this.listeners.get("closed")?.();
  });
  readonly loadURL: (url: string) => Promise<void>;
  destroyed = false;
  readonly listeners = new Map<string, () => void>();

  constructor(loadURL: (url: string) => Promise<void>) {
    this.loadURL = loadURL;
  }

  once(event: "ready-to-show" | "closed", listener: () => void): void {
    this.listeners.set(event, listener);
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

function harness(loadURL: (url: string) => Promise<void> = () => Promise.resolve()): Harness {
  const window = new FakeWindow(loadURL);
  const handled = new Map<string, (...args: never[]) => unknown>();
  const removed: string[] = [];
  const host: ApplicationHost = {
    createWindow: () => window,
    entryUrl,
    ipc: {
      handle: (channel, listener) => {
        handled.set(channel, listener as (...args: never[]) => unknown);
      },
      removeHandler: (channel) => {
        handled.delete(channel);
        removed.push(channel);
      },
    },
    appVersion: "1.2.3",
  };
  return {
    host,
    window,
    handled,
    removed,
    emit: (event) => { window.listeners.get(event)?.(); },
  };
}

describe("startDesktopApplication", () => {
  it("creates the window, guards it and loads the trusted entry", async () => {
    const test = harness();

    const window = await startDesktopApplication(test.host, {
      selectFolder: () => Promise.resolve(null),
    });

    expect(window).toBe(test.window);
    expect(test.window.webContents.setWindowOpenHandler).toHaveBeenCalledOnce();
    expect(test.window.webContents.on).toHaveBeenCalledWith(
      "will-navigate",
      expect.any(Function),
    );
    // Every request channel is reachable once the window exists.
    expect([...test.handled.keys()].sort()).toEqual(
      Object.values(DESKTOP_CHANNELS).sort(),
    );
    expect(test.window.show).not.toHaveBeenCalled();
  });

  it("shows the window only once it is ready to paint", async () => {
    const test = harness();
    await startDesktopApplication(test.host, {
      selectFolder: () => Promise.resolve(null),
    });

    test.emit("ready-to-show");

    expect(test.window.show).toHaveBeenCalledOnce();
  });

  it("releases everything and destroys the window when the load fails", async () => {
    const failure = new Error("the renderer entry could not be reached");
    const test = harness(() => Promise.reject(failure));

    await expect(startDesktopApplication(test.host, {
      selectFolder: () => Promise.resolve(null),
    })).rejects.toBe(failure);

    expect(test.window.destroy).toHaveBeenCalledOnce();
    expect(test.handled.size).toBe(0);
    // Registration removes stale handlers first, so every channel is removed and
    // then removed again on release.
    for (const channel of Object.values(DESKTOP_CHANNELS)) {
      expect(test.removed.filter((removed) => removed === channel).length)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it("removes the request handlers when the window closes", async () => {
    const test = harness();
    await startDesktopApplication(test.host, {
      selectFolder: () => Promise.resolve(null),
    });
    expect(test.handled.size).toBeGreaterThan(0);

    test.emit("closed");

    expect(test.handled.size).toBe(0);
  });

  it("releases once even when a failed load also reports the window closed", async () => {
    // `destroy` emits "closed" in Electron, so the release path runs twice.
    const test = harness(() => Promise.reject(new Error("load failed")));

    await expect(startDesktopApplication(test.host, {
      selectFolder: () => Promise.resolve(null),
    })).rejects.toThrow("load failed");

    const perChannel = Object.values(DESKTOP_CHANNELS).map((channel) =>
      test.removed.filter((removed) => removed === channel).length,
    );
    // Registration removes once, release removes once. A second release would
    // push a third entry for every channel.
    expect(new Set(perChannel)).toEqual(new Set([2]));
  });

  it("accepts a request from the live window and rejects it after close", async () => {
    const test = harness();
    await startDesktopApplication(test.host, {
      selectFolder: () => Promise.resolve(null),
    });
    const selectRepository = test.handled.get(DESKTOP_CHANNELS.selectRepository);
    if (selectRepository === undefined) {
      throw new Error("The repository channel was not registered.");
    }
    const invoke = selectRepository as (event: unknown) => Promise<{ status: string }>;
    const event = { senderFrame: { url: entryUrl }, sender: { id: 7 } };

    // The seam cancels, which only a request that passed the trust check reaches.
    await expect(invoke(event)).resolves.toEqual({ status: "cancelled" });

    test.emit("closed");
    // The handler stays reachable in this fake, so the trust check is what changes.
    await expect(invoke(event)).resolves.toMatchObject({ status: "error" });
  });
});
