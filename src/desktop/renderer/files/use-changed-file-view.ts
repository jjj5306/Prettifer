import { useState } from "react";

import { groupKeyForRule, selectGroupRule } from "../../../grouping/group-files.js";
import { reviewGroupRules, type GroupRuleReview } from "../../../grouping/group-rule.js";
import type { GroupingRulesState } from "../state/app-state.js";

export type FileView = "tree" | "list" | "config";

/**
 * What the changed file panel is showing and what is folded away. The workbench
 * owns it because the activity rail opens the rule editor too, and both entry
 * points have to leave the panel in the same state.
 */
export interface ChangedFileViewControl {
  readonly view: FileView;
  readonly collapsedDirectories: ReadonlySet<string>;
  readonly collapsedGroups: ReadonlySet<string>;
  readonly isEditorOpen: boolean;
  /** The rules that can be applied, and the ones that were left out. */
  readonly review: GroupRuleReview;
  readonly selectView: (next: FileView) => void;
  /** Shows the groups and opens the rule editor, from wherever the user was. */
  readonly openRuleEditor: () => void;
  readonly closeRuleEditor: () => void;
  readonly toggleDirectory: (path: string) => void;
  readonly toggleGroup: (key: string) => void;
}

const EMPTY_REVIEW: GroupRuleReview = { rules: [], problems: [] };

export function useChangedFileView(
  selectedFilePath: string | null,
  groupingRules: GroupingRulesState,
): ChangedFileViewControl {
  const [view, setView] = useState<FileView>("list");
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const review = groupingRules.status === "ready"
    ? reviewGroupRules(groupingRules.rules)
    : EMPTY_REVIEW;

  /*
   * Arriving in Config View with a file under review must not hide it, so the
   * group that holds it is expanded as the view changes. Every way into the
   * view goes through here, so the rail behaves like the toggle.
   */
  const selectView = (next: FileView): void => {
    if (next === "config" && selectedFilePath !== null) {
      const key = groupKeyForRule(selectGroupRule(selectedFilePath, review.rules));
      setCollapsedGroups((current) => expanded(current, key));
    }
    setView(next);
  };

  return {
    view,
    collapsedDirectories,
    collapsedGroups,
    isEditorOpen,
    review,
    selectView,
    openRuleEditor: () => {
      selectView("config");
      setIsEditorOpen(true);
    },
    closeRuleEditor: () => { setIsEditorOpen(false); },
    toggleDirectory: (path) => {
      setCollapsedDirectories((current) => toggled(current, path));
    },
    toggleGroup: (key) => {
      setCollapsedGroups((current) => toggled(current, key));
    },
  };
}

/** Adds the key when it is absent and removes it when it is present. */
function toggled(current: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(current);
  if (!next.delete(key)) {
    next.add(key);
  }
  return next;
}

function expanded(current: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (!current.has(key)) {
    return current;
  }
  const next = new Set(current);
  next.delete(key);
  return next;
}
