import { describe, expect, it, vi } from "vitest";

import { createDesktopApi } from "../../../src/desktop/preload/desktop-api.js";
import { DESKTOP_CHANNELS } from "../../../src/desktop/shared/index.js";

describe("preload desktop API", () => {
  it("exposes only named user operations", () => {
    const api = createDesktopApi(vi.fn());

    expect(Object.keys(api)).toEqual([
      "selectRepository",
      "openInitialRepository",
      "loadRange",
      "listCommits",
      "composeSelection",
      "searchSymbol",
      "cancelComposition",
      "readBaseFile",
      "listBaseTree",
      "readGroupingRules",
      "saveGroupingRules",
    ]);
    expect(api).not.toHaveProperty("invoke");
    expect(api).not.toHaveProperty("send");
    expect(api).not.toHaveProperty("on");
    expect(api).not.toHaveProperty("ipcRenderer");
  });

  it("uses a fixed channel for each function and forwards only request data", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "cancelled" });
    const api = createDesktopApi(invoke);
    const request = {
      repositorySessionId: "00000000-0000-4000-8000-000000000001",
      sessionRevision: 1,
      baseRef: "main",
      headRef: "feature/ui",
    };

    await api.selectRepository();
    await api.loadRange(request);

    expect(invoke).toHaveBeenNthCalledWith(1, DESKTOP_CHANNELS.selectRepository);
    expect(invoke).toHaveBeenNthCalledWith(2, DESKTOP_CHANNELS.loadRange, request);
    expect(invoke.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ sender: expect.anything() }));
  });

  it("freezes the exposed API so channels cannot be replaced", () => {
    expect(Object.isFrozen(createDesktopApi(vi.fn()))).toBe(true);
  });
});
