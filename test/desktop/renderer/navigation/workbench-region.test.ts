import { describe, expect, it } from "vitest";

import {
  currentRegion,
  regionNeedsFile,
  regionNeedsResult,
} from "../../../../src/desktop/renderer/navigation/workbench-region.js";

describe("regionNeedsResult", () => {
  it("marks the regions that only exist once a result does", () => {
    expect(regionNeedsResult("files")).toBe(true);
    expect(regionNeedsResult("fileHistory")).toBe(true);
    expect(regionNeedsResult("diff")).toBe(true);
  });

  it("leaves the repository and history usable without a result", () => {
    expect(regionNeedsResult("repository")).toBe(false);
    expect(regionNeedsResult("history")).toBe(false);
  });
});

describe("regionNeedsFile", () => {
  it("requires a selected changed file only for File History", () => {
    expect(regionNeedsFile("fileHistory")).toBe(true);
    expect(regionNeedsFile("repository")).toBe(false);
  });
});

describe("currentRegion", () => {
  it("keeps the active region while a result exists", () => {
    expect(currentRegion("diff", true)).toBe("diff");
    expect(currentRegion("fileHistory", true, true)).toBe("fileHistory");
  });

  it("falls back to the history when the active region needs a result", () => {
    expect(currentRegion("files", false)).toBe("history");
    expect(currentRegion("diff", false)).toBe("history");
    expect(currentRegion("fileHistory", false, false)).toBe("history");
  });

  it("leaves a region that does not need a result alone", () => {
    expect(currentRegion("repository", false)).toBe("repository");
  });
});
