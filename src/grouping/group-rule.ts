/**
 * A user-defined rule that collects changed files under one group name. The
 * prefix is a repository-relative path; it is compared at path segment
 * boundaries so `src/te` never claims `src/test.txt`.
 */
export interface GroupRule {
  readonly prefix: string;
  readonly name: string;
}

/**
 * Why a rule cannot be used. The shape matches the desktop diagnostic so one
 * component renders a rule problem and a request failure the same way.
 */
export interface GroupRuleProblem {
  readonly code: string;
  readonly message: string;
  readonly subject: string;
  readonly nextAction: string;
}

export interface GroupRuleReview {
  /** Rules that can be applied, normalized and in their original order. */
  readonly rules: readonly GroupRule[];
  /** One entry per rule that was left out, in the order the rules appear. */
  readonly problems: readonly GroupRuleProblem[];
}

/**
 * Rules past this count are not applied. Groups stop helping long before the
 * list gets this long, and the limit keeps a hand-edited file from filling the
 * panel with hundreds of headers.
 */
export const GROUP_RULE_LIMIT = 50;

/**
 * Brings a prefix to the form the matcher compares against: forward slashes, no
 * surrounding or repeated separators and no `.` segments. Absolute paths and
 * `..` are left in place so `checkGroupRule` can report them instead of quietly
 * turning them into something else.
 */
export function normalizeGroupPrefix(prefix: string): string {
  return prefix
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

export function normalizeGroupName(name: string): string {
  return name.trim();
}

/**
 * Checks one rule against the rules that already exist. Returns the first
 * problem so the screen can point at a single cause, or null when the rule can
 * be applied.
 */
export function checkGroupRule(
  candidate: GroupRule,
  others: readonly GroupRule[],
): GroupRuleProblem | null {
  const subject = describeRule(candidate);
  const raw = candidate.prefix.replaceAll("\\", "/");
  const prefix = normalizeGroupPrefix(candidate.prefix);
  const name = normalizeGroupName(candidate.name);

  if (prefix.length === 0) {
    return {
      code: "GROUP_RULE_PREFIX_EMPTY",
      message: "A group rule needs a repository path prefix.",
      subject,
      nextAction: "Enter a repository-relative path such as tests, then save the rule again.",
    };
  }
  if (raw.startsWith("/") || /^[A-Za-z]:/u.test(raw) || prefix.split("/").includes("..")) {
    return {
      code: "GROUP_RULE_PREFIX_NOT_RELATIVE",
      message: "A group rule prefix must be a repository-relative path.",
      subject,
      nextAction: "Remove the drive letter, leading slash or .. segment, then save the rule again.",
    };
  }
  if (name.length === 0) {
    return {
      code: "GROUP_RULE_NAME_EMPTY",
      message: "A group rule needs a group name.",
      subject,
      nextAction: "Enter a name for the group, then save the rule again.",
    };
  }

  const samePrefix = others.find(
    (other) => normalizeGroupPrefix(other.prefix) === prefix,
  );
  if (samePrefix !== undefined) {
    return {
      code: "GROUP_RULE_PREFIX_DUPLICATE",
      message: `The prefix ${prefix} is already used by the group ${normalizeGroupName(samePrefix.name)}.`,
      subject,
      nextAction: "Change the prefix, or edit the existing rule instead.",
    };
  }

  const sameName = others.find(
    (other) => normalizeGroupName(other.name).toLowerCase() === name.toLowerCase(),
  );
  if (sameName !== undefined) {
    return {
      code: "GROUP_RULE_NAME_DUPLICATE",
      message: `The group name ${name} is already used by the prefix ${normalizeGroupPrefix(sameName.prefix)}.`,
      subject,
      nextAction: "Change the group name, or edit the existing rule instead.",
    };
  }

  if (others.length >= GROUP_RULE_LIMIT) {
    return groupRuleLimitProblem();
  }
  return null;
}

/**
 * Splits a stored rule list into the rules that can be applied and the problems
 * to show. A bad rule never stops the rest: grouping keeps working with what is
 * left, which is what the panel needs when the file was edited by hand.
 */
export function reviewGroupRules(rules: readonly GroupRule[]): GroupRuleReview {
  const accepted: GroupRule[] = [];
  const problems: GroupRuleProblem[] = [];

  for (const rule of rules) {
    if (accepted.length >= GROUP_RULE_LIMIT) {
      problems.push(groupRuleLimitProblem());
      break;
    }
    const problem = checkGroupRule(rule, accepted);
    if (problem !== null) {
      problems.push(problem);
      continue;
    }
    accepted.push({
      prefix: normalizeGroupPrefix(rule.prefix),
      name: normalizeGroupName(rule.name),
    });
  }

  return { rules: accepted, problems };
}

function groupRuleLimitProblem(): GroupRuleProblem {
  return {
    code: "GROUP_RULE_LIMIT_REACHED",
    message: `Config View applies at most ${GROUP_RULE_LIMIT} rules.`,
    subject: "Rule list",
    nextAction: "Delete a rule you no longer need, then add this one.",
  };
}

/** Names the rule a problem is about, so the message points at something. */
function describeRule(rule: GroupRule): string {
  const name = normalizeGroupName(rule.name);
  if (name.length > 0) {
    return name;
  }
  const prefix = normalizeGroupPrefix(rule.prefix);
  return prefix.length > 0 ? prefix : "Unnamed rule";
}
