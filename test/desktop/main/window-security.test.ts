import { describe, expect, it, vi } from "vitest";

import {
  applyContentSecurityPolicy,
  configurePermissionGuards,
  configureWindowGuards,
  createMainWindowOptions,
  getContentSecurityPolicy,
} from "../../../src/desktop/main/window-security.js";

describe("main window security", () => {
  it("creates an isolated sandboxed renderer without Node.js", () => {
    expect(createMainWindowOptions("C:\\app\\preload.js")).toMatchObject({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        preload: "C:\\app\\preload.js",
      },
    });
  });

  it("keeps production scripts local and limits development exceptions", () => {
    const production = getContentSecurityPolicy(false);
    const development = getContentSecurityPolicy(
      true,
      "http://localhost:3000/main_window/index.html",
    );

    expect(production).toContain("default-src 'self'");
    expect(production).toContain("script-src 'self'");
    expect(production).toContain("object-src 'none'");
    expect(production).not.toContain("'unsafe-eval'");
    expect(development).toContain("script-src 'self' 'unsafe-eval'");
    expect(development).toContain(
      "connect-src 'self' http://localhost:3000 ws://localhost:3000",
    );
    expect(development).not.toContain("connect-src 'self' ws: http:");
  });

  it("denies new windows and navigation outside the application URL", () => {
    let navigate: ((event: { preventDefault(): void }, url: string) => void) | undefined;
    let openWindow: (() => { readonly action: "deny" }) | undefined;
    const setWindowOpenHandler = vi.fn((handler: () => { readonly action: "deny" }) => {
      openWindow = handler;
    });
    configureWindowGuards({
      setWindowOpenHandler,
      on: vi.fn((_name, listener) => {
        navigate = listener;
      }),
    }, "http://localhost:3000/main_window/index.html");

    expect(openWindow?.()).toEqual({ action: "deny" });
    const allowedEvent = { preventDefault: vi.fn() };
    navigate?.(allowedEvent, "http://localhost:3000/main_window/index.html");
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled();
    const normalizedFileEvent = { preventDefault: vi.fn() };
    configureWindowGuards({
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((_name, listener) => {
        navigate = listener;
      }),
    }, "file://C:\\Prettifer\\index.html");
    navigate?.(normalizedFileEvent, "file:///C:/Prettifer/index.html");
    expect(normalizedFileEvent.preventDefault).not.toHaveBeenCalled();
    const blockedEvent = { preventDefault: vi.fn() };
    navigate?.(blockedEvent, "https://example.com/");
    expect(blockedEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it("denies permission checks and requests by default", () => {
    let checkPermission: (() => boolean) | undefined;
    let requestPermission:
      | ((webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void)
      | undefined;
    const permissionSession = {
      setPermissionCheckHandler: vi.fn((handler: () => boolean) => {
        checkPermission = handler;
      }),
      setPermissionRequestHandler: vi.fn((handler: typeof requestPermission) => {
        requestPermission = handler;
      }),
    };
    configurePermissionGuards(permissionSession);

    expect(checkPermission?.()).toBe(false);
    const callback = vi.fn();
    requestPermission?.({}, "camera", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("replaces existing CSP headers with the application policy", () => {
    const completed = vi.fn();
    applyContentSecurityPolicy(false, {
      responseHeaders: {
        "Content-Security-Policy": ["default-src *"],
        "X-Test": ["kept"],
      },
    }, completed);

    expect(completed).toHaveBeenCalledWith({
      responseHeaders: {
        "Content-Security-Policy": [getContentSecurityPolicy(false)],
        "X-Test": ["kept"],
      },
    });
  });
});
