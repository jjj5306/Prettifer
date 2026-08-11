import { describe, expect, it } from "vitest";

import {
  currentPanel,
  currentRegion,
  regionNeedsResult,
} from "../../../../src/desktop/renderer/navigation/workbench-region.js";

describe("regionNeedsResult", () => {
  it("marks the regions that only exist once a result does", () => {
    expect(regionNeedsResult("files")).toBe(true);
    expect(regionNeedsResult("fileHistory")).toBe(true);
    expect(regionNeedsResult("rules")).toBe(true);
    expect(regionNeedsResult("diff")).toBe(true);
  });

  it("leaves the repository and history usable without a result", () => {
    expect(regionNeedsResult("repository")).toBe(false);
    expect(regionNeedsResult("history")).toBe(false);
  });
});

describe("currentRegion", () => {
  it("keeps the active region while a result exists", () => {
    expect(currentRegion("diff", true)).toBe("diff");
    expect(currentRegion("rules", true)).toBe("rules");
    expect(currentRegion("fileHistory", true, true)).toBe("fileHistory");
  });

  it("falls back to the history when the active region needs a result", () => {
    expect(currentRegion("files", false)).toBe("history");
    expect(currentRegion("rules", false)).toBe("history");
    expect(currentRegion("diff", false)).toBe("history");
    expect(currentRegion("fileHistory", true, false)).toBe("history");
  });

  it("leaves a region that does not need a result alone", () => {
    expect(currentRegion("repository", false)).toBe("repository");
  });
});

describe("currentPanel", () => {
  it("sends the group rules region to the changed file panel", () => {
    expect(currentPanel("rules", true)).toBe("files");
    expect(currentPanel("fileHistory", true, true)).toBe("files");
  });

  it("marks the panel of every other region directly", () => {
    expect(currentPanel("repository", true)).toBe("repository");
    expect(currentPanel("history", true)).toBe("history");
    expect(currentPanel("files", true)).toBe("files");
    expect(currentPanel("diff", true)).toBe("diff");
  });

  it("follows the fallback when no result exists", () => {
    expect(currentPanel("rules", false)).toBe("history");
    expect(currentPanel("diff", false)).toBe("history");
  });
});
