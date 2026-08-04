import { describe, expect, it } from "vitest";

import {
  GROUP_RULE_LIMIT,
  checkGroupRule,
  normalizeGroupPrefix,
  reviewGroupRules,
  type GroupRule,
} from "../../../src/grouping/group-rule.js";

describe("normalizeGroupPrefix", () => {
  it("keeps a repository-relative path unchanged", () => {
    expect(normalizeGroupPrefix("src/test")).toBe("src/test");
  });

  it("removes surrounding and repeated separators", () => {
    expect(normalizeGroupPrefix("  /src//test/  ")).toBe("src/test");
  });

  it("accepts backslashes as separators", () => {
    expect(normalizeGroupPrefix("src\\test\\")).toBe("src/test");
  });

  it("drops current directory segments", () => {
    expect(normalizeGroupPrefix("./src/./test")).toBe("src/test");
  });

  it("keeps parent segments so they can be reported", () => {
    expect(normalizeGroupPrefix("src/../etc")).toBe("src/../etc");
  });
});

describe("checkGroupRule", () => {
  const rule = (prefix: string, name: string): GroupRule => ({ prefix, name });

  it("accepts a rule with a relative prefix and a name", () => {
    expect(checkGroupRule(rule("tests/", "Tests"), [])).toBeNull();
  });

  it("rejects an empty prefix with a cause and a next action", () => {
    const problem = checkGroupRule(rule("   ", "Tests"), []);

    expect(problem?.code).toBe("GROUP_RULE_PREFIX_EMPTY");
    expect(problem?.subject).toBe("Tests");
    expect(problem?.nextAction).not.toBe("");
  });

  it("rejects an absolute prefix", () => {
    expect(checkGroupRule(rule("/etc", "Config"), [])?.code)
      .toBe("GROUP_RULE_PREFIX_NOT_RELATIVE");
  });

  it("rejects a prefix with a drive letter", () => {
    expect(checkGroupRule(rule("C:\\repo\\src", "Source"), [])?.code)
      .toBe("GROUP_RULE_PREFIX_NOT_RELATIVE");
  });

  it("rejects a prefix that leaves the repository", () => {
    expect(checkGroupRule(rule("src/../../etc", "Config"), [])?.code)
      .toBe("GROUP_RULE_PREFIX_NOT_RELATIVE");
  });

  it("rejects an empty group name", () => {
    const problem = checkGroupRule(rule("tests", "  "), []);

    expect(problem?.code).toBe("GROUP_RULE_NAME_EMPTY");
    expect(problem?.subject).toBe("tests");
  });

  it("names the conflicting group when the prefix is already used", () => {
    const problem = checkGroupRule(rule("tests/", "Suites"), [rule("tests", "Tests")]);

    expect(problem?.code).toBe("GROUP_RULE_PREFIX_DUPLICATE");
    expect(problem?.message).toContain("Tests");
  });

  it("names the conflicting prefix when the group name is already used", () => {
    const problem = checkGroupRule(rule("spec", "tests"), [rule("tests", "Tests")]);

    expect(problem?.code).toBe("GROUP_RULE_NAME_DUPLICATE");
    expect(problem?.message).toContain("tests");
  });

  it("reports the limit when the list is already full", () => {
    const full = Array.from(
      { length: GROUP_RULE_LIMIT },
      (_unused, index) => rule(`dir${index}`, `Group ${index}`),
    );

    expect(checkGroupRule(rule("extra", "Extra"), full)?.code)
      .toBe("GROUP_RULE_LIMIT_REACHED");
  });

  it("allows a rule to keep its own prefix while being edited", () => {
    const rules = [rule("tests", "Tests"), rule("docs", "Docs")];
    const others = rules.filter((_unused, index) => index !== 0);

    expect(checkGroupRule(rule("tests", "Test code"), others)).toBeNull();
  });
});

describe("reviewGroupRules", () => {
  const rule = (prefix: string, name: string): GroupRule => ({ prefix, name });

  it("normalizes accepted rules and keeps their order", () => {
    const review = reviewGroupRules([rule(" docs/ ", " Docs "), rule("tests", "Tests")]);

    expect(review.rules).toEqual([
      { prefix: "docs", name: "Docs" },
      { prefix: "tests", name: "Tests" },
    ]);
    expect(review.problems).toEqual([]);
  });

  it("keeps grouping with the valid rules when one rule is wrong", () => {
    const review = reviewGroupRules([rule("tests", "Tests"), rule("", "Broken")]);

    expect(review.rules).toEqual([{ prefix: "tests", name: "Tests" }]);
    expect(review.problems).toHaveLength(1);
    expect(review.problems[0]?.code).toBe("GROUP_RULE_PREFIX_EMPTY");
  });

  it("applies rules up to the limit and reports that the limit was reached", () => {
    const rules = Array.from(
      { length: GROUP_RULE_LIMIT + 3 },
      (_unused, index) => rule(`dir${index}`, `Group ${index}`),
    );

    const review = reviewGroupRules(rules);

    expect(review.rules).toHaveLength(GROUP_RULE_LIMIT);
    expect(review.problems).toHaveLength(1);
    expect(review.problems[0]?.code).toBe("GROUP_RULE_LIMIT_REACHED");
  });
});
