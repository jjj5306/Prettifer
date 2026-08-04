import type { GroupRule } from "./group-rule.js";

export interface PathGroup {
  /** Stable identity for selection and collapse state. */
  readonly key: string;
  readonly name: string;
  /** The rule this group came from, or null for the group no rule matched. */
  readonly prefix: string | null;
  readonly paths: readonly string[];
}

export const UNGROUPED_GROUP_NAME = "Ungrouped";
export const UNGROUPED_GROUP_KEY = "ungrouped";

/**
 * Whether a repository-relative path sits under a prefix. The comparison stops
 * at a path segment boundary, so `src/te` does not claim `src/test.txt`, and a
 * prefix that names a file matches that file.
 */
export function matchesGroupPrefix(path: string, prefix: string): boolean {
  return prefix.length > 0 && (path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Picks the rule that applies to a path. The longest matching prefix wins, so
 * the answer does not depend on the order the user arranged the rules in.
 */
export function selectGroupRule(
  path: string,
  rules: readonly GroupRule[],
): GroupRule | null {
  let selected: GroupRule | null = null;
  for (const rule of rules) {
    if (!matchesGroupPrefix(path, rule.prefix)) {
      continue;
    }
    if (selected === null || rule.prefix.length > selected.prefix.length) {
      selected = rule;
    }
  }
  return selected;
}

/** The identity a group is known by, so every caller writes the same key. */
export function groupKeyForRule(rule: GroupRule | null): string {
  return rule === null ? UNGROUPED_GROUP_KEY : `rule:${rule.prefix}`;
}

/**
 * Builds one group per rule, in the order the user arranged them, and collects
 * everything no rule matched into a last group. Every input path lands in
 * exactly one group, so the panel never drops a changed file.
 *
 * Rules must already be reviewed: prefixes are normalized and unique.
 */
export function groupPathsByRule(
  paths: readonly string[],
  rules: readonly GroupRule[],
): readonly PathGroup[] {
  const byPrefix = new Map<string, string[]>(rules.map((rule) => [rule.prefix, []]));
  const ungrouped: string[] = [];

  for (const path of paths) {
    const rule = selectGroupRule(path, rules);
    if (rule === null) {
      ungrouped.push(path);
      continue;
    }
    byPrefix.get(rule.prefix)?.push(path);
  }

  const groups = rules.map((rule) => ({
    key: groupKeyForRule(rule),
    name: rule.name,
    prefix: rule.prefix,
    paths: byPrefix.get(rule.prefix) ?? [],
  }));

  return ungrouped.length === 0
    ? groups
    : [
        ...groups,
        {
          key: UNGROUPED_GROUP_KEY,
          name: UNGROUPED_GROUP_NAME,
          prefix: null,
          paths: ungrouped,
        },
      ];
}
