import { describe, expect, it } from "vitest";

import { isContentConfigurationKey } from "../../src/composition/composition-workspace.js";

/**
 * Pins the Git configuration the temporary workspace has to reproduce. The
 * search pattern is handed to `git config --get-regexp`, so a silent change to
 * the matched key set would change composition results without any other test
 * noticing.
 */
const probe: Array<string> = [];

describe("isContentConfigurationKey", () => {
  it("uses the probe", () => { expect(probe).toEqual([]); });

  it.each([
    "core.attributesfile",
    "core.autocrlf",
    "core.bigfilethreshold",
    "core.checkroundtripencoding",
    "core.eol",
    "core.longpaths",
    "core.safecrlf",
    "core.symlinks",
    "merge.renormalize",
    "merge.ours.driver",
    "merge.ours.recursive",
    "filter.lfs.clean",
    "filter.lfs.smudge",
    "filter.lfs.process",
    "filter.lfs.required",
  ])("matches %s", (name) => {
    expect(isContentConfigurationKey(name)).toBe(true);
  });

  it.each([
    // Not content related.
    "core.editor",
    "core.filemode",
    "core.hookspath",
    "merge.tool",
    "merge.conflictstyle",
    "filter.lfs.other",
    // A driver or filter key always carries its name.
    "merge.driver",
    "filter.clean",
    // Anchored at both ends.
    "core.autocrlfx",
    "xcore.autocrlf",
    "core.eol.extra",
  ])("does not match %s", (name) => {
    expect(isContentConfigurationKey(name)).toBe(false);
  });

  it("matches a driver name that contains a dot", () => {
    // `git config` allows dots inside the middle name, and the previous pattern
    // accepted them, so the generated pattern has to keep doing that.
    expect(isContentConfigurationKey("merge.my.custom.driver")).toBe(true);
    expect(isContentConfigurationKey("filter.my.custom.smudge")).toBe(true);
  });
});
