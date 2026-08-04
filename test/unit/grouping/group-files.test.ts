import { describe, expect, it } from "vitest";

import {
  UNGROUPED_GROUP_KEY,
  groupPathsByRule,
  matchesGroupPrefix,
  selectGroupRule,
} from "../../../src/grouping/group-files.js";
import { reviewGroupRules, type GroupRule } from "../../../src/grouping/group-rule.js";

const rules = (...pairs: readonly (readonly [string, string])[]): readonly GroupRule[] =>
  reviewGroupRules(pairs.map(([prefix, name]) => ({ prefix, name }))).rules;

describe("matchesGroupPrefix", () => {
  it("matches a file under the prefix directory", () => {
    expect(matchesGroupPrefix("src/test/a.java", "src/test")).toBe(true);
  });

  it("matches a prefix that names the file itself", () => {
    expect(matchesGroupPrefix("package.json", "package.json")).toBe(true);
  });

  it("does not match across a segment boundary", () => {
    expect(matchesGroupPrefix("src/test.txt", "src/te")).toBe(false);
  });

  it("does not match a sibling directory with a longer name", () => {
    expect(matchesGroupPrefix("src/tests/a.java", "src/test")).toBe(false);
  });
});

describe("selectGroupRule", () => {
  it("applies the longest matching prefix", () => {
    const applied = selectGroupRule(
      "src/test/a.java",
      rules(["src", "Source"], ["src/test", "Tests"]),
    );

    expect(applied?.name).toBe("Tests");
  });

  it("gives the same answer whatever order the rules are in", () => {
    const forward = selectGroupRule(
      "src/test/a.java",
      rules(["src", "Source"], ["src/test", "Tests"]),
    );
    const reversed = selectGroupRule(
      "src/test/a.java",
      rules(["src/test", "Tests"], ["src", "Source"]),
    );

    expect(forward?.prefix).toBe(reversed?.prefix);
  });

  it("returns null when no rule matches", () => {
    expect(selectGroupRule("README.md", rules(["src", "Source"]))).toBeNull();
  });
});

describe("groupPathsByRule", () => {
  const paths = [
    "README.md",
    "src/main/App.java",
    "src/test/AppTest.java",
    "tests/e2e/run.ts",
  ];

  it("builds one group per rule in the order the user arranged them", () => {
    const groups = groupPathsByRule(paths, rules(["tests", "Tests"], ["src", "Source"]));

    expect(groups.map((group) => group.name)).toEqual(["Tests", "Source", "Ungrouped"]);
  });

  it("puts a file under the longest matching prefix only", () => {
    const groups = groupPathsByRule(
      paths,
      rules(["src", "Source"], ["src/test", "Unit tests"]),
    );

    expect(groups.find((group) => group.name === "Unit tests")?.paths)
      .toEqual(["src/test/AppTest.java"]);
    expect(groups.find((group) => group.name === "Source")?.paths)
      .toEqual(["src/main/App.java"]);
  });

  it("keeps files no rule matched in a last group", () => {
    const groups = groupPathsByRule(paths, rules(["src", "Source"]));
    const last = groups.at(-1);

    expect(last?.key).toBe(UNGROUPED_GROUP_KEY);
    expect(last?.paths).toEqual(["README.md", "tests/e2e/run.ts"]);
  });

  it("omits the last group when every file matched a rule", () => {
    const groups = groupPathsByRule(
      ["src/a.ts", "tests/b.ts"],
      rules(["src", "Source"], ["tests", "Tests"]),
    );

    expect(groups.some((group) => group.key === UNGROUPED_GROUP_KEY)).toBe(false);
  });

  it("keeps a rule that matched nothing as an empty group", () => {
    const groups = groupPathsByRule(["README.md"], rules(["src", "Source"]));

    expect(groups.find((group) => group.name === "Source")?.paths).toEqual([]);
  });

  it("preserves every path exactly once", () => {
    const groups = groupPathsByRule(
      paths,
      rules(["src", "Source"], ["src/test", "Unit tests"], ["docs", "Docs"]),
    );
    const grouped = groups.flatMap((group) => group.paths);

    expect(grouped).toHaveLength(paths.length);
    expect(new Set(grouped)).toEqual(new Set(paths));
  });

  it("does not move files between groups when the display order changes", () => {
    const forward = groupPathsByRule(paths, rules(["src", "Source"], ["src/test", "Tests"]));
    const reversed = groupPathsByRule(paths, rules(["src/test", "Tests"], ["src", "Source"]));
    const byName = (groups: readonly { name: string; paths: readonly string[] }[]) =>
      Object.fromEntries(groups.map((group) => [group.name, group.paths]));

    expect(byName(reversed)).toEqual(byName(forward));
  });

  it("groups every path into the ungrouped group when there are no rules", () => {
    const groups = groupPathsByRule(paths, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.paths).toEqual(paths);
  });
});
