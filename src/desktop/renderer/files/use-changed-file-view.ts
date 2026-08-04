import { useState } from "react";

import { groupKeyForRule, selectGroupRule } from "../../../grouping/group-files.js";
import { reviewGroupRules, type GroupRuleReview } from "../../../grouping/group-rule.js";
import type { GroupingRulesState } from "../state/app-state.js";
import { directoriesLeadingTo } from "./full-tree.js";

export type FileView = "tree" | "list" | "config" | "fullTree";

/**
 * What the changed file panel is showing and what is folded away. The workbench
 * owns it because the activity rail opens the rule editor too, and both entry
 * points have to leave the panel in the same state.
 */
export interface ChangedFileViewControl {
  readonly view: FileView;
  readonly collapsedDirectories: ReadonlySet<string>;
  readonly collapsedGroups: ReadonlySet<string>;
  /**
   * Which Full Tree folders are open. Full Tree tracks the open ones rather than
   * the folded ones because it starts folded: the whole repository expanded would
   * render every row it has.
   */
  readonly expandedBaseDirectories: ReadonlySet<string>;
  readonly isEditorOpen: boolean;
  /** The rules that can be applied, and the ones that were left out. */
  readonly review: GroupRuleReview;
  readonly selectView: (next: FileView) => void;
  /** Shows the groups and opens the rule editor, from wherever the user was. */
  readonly openRuleEditor: () => void;
  readonly closeRuleEditor: () => void;
  readonly toggleDirectory: (path: string) => void;
  readonly toggleGroup: (key: string) => void;
  readonly toggleBaseDirectory: (path: string) => void;
}

interface ChangedFileViewOptions {
  /** Paths the result changed, which decide the folders Full Tree opens. */
  readonly changedPaths: readonly string[];
  /** Called when Full Tree becomes the shown view, so its paths can be read. */
  readonly onShowFullTree?: () => void;
}

const EMPTY_REVIEW: GroupRuleReview = { rules: [], problems: [] };

export function useChangedFileView(
  selectedFilePath: string | null,
  groupingRules: GroupingRulesState,
  options: ChangedFileViewOptions = { changedPaths: [] },
): ChangedFileViewControl {
  const [view, setView] = useState<FileView>("list");
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  /** Null until the user folds or opens something, so the default can move. */
  const [openedBaseDirectories, setOpenedBaseDirectories] = useState<
    ReadonlySet<string> | null
  >(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const review = groupingRules.status === "ready"
    ? reviewGroupRules(groupingRules.rules)
    : EMPTY_REVIEW;
  const expandedBaseDirectories = openedBaseDirectories
    ?? directoriesLeadingTo(options.changedPaths);

  /*
   * Arriving in a view must not hide the file under review, so the group or the
   * folders that hold it are opened as the view changes. Every way into a view
   * goes through here, so the rail behaves like the toggle.
   */
  const selectView = (next: FileView): void => {
    if (next === "config" && selectedFilePath !== null) {
      const key = groupKeyForRule(selectGroupRule(selectedFilePath, review.rules));
      setCollapsedGroups((current) => expanded(current, key));
    }
    if (next === "fullTree") {
      if (selectedFilePath !== null) {
        const onPath = directoriesLeadingTo([selectedFilePath]);
        setOpenedBaseDirectories((current) =>
          new Set([...(current ?? expandedBaseDirectories), ...onPath]),
        );
      }
      options.onShowFullTree?.();
    }
    setView(next);
  };

  return {
    view,
    collapsedDirectories,
    collapsedGroups,
    expandedBaseDirectories,
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
    toggleBaseDirectory: (path) => {
      setOpenedBaseDirectories((current) =>
        toggled(current ?? expandedBaseDirectories, path),
      );
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
