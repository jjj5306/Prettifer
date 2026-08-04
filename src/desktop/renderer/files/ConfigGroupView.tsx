import type { Diagnostic, GroupRuleDto } from "../../shared/index.js";
import { groupPathsByRule, type PathGroup } from "../../../grouping/group-files.js";
import type { GroupRule, GroupRuleProblem } from "../../../grouping/group-rule.js";
import type { GroupingRulesState } from "../state/app-state.js";
import { FileButton } from "./FileButton.js";
import { GroupRuleEditor } from "./GroupRuleEditor.js";
import { RuleLocationNote } from "./RuleLocationNote.js";
import type { ReviewEntry } from "./review-entries.js";
import styles from "./ChangedFilePane.module.css";

interface ConfigGroupViewProps {
  readonly entries: readonly ReviewEntry[];
  /** Root of the open repository, which is the key the rules are kept under. */
  readonly repositoryPath: string;
  readonly rulesState: GroupingRulesState;
  /** The rules that can be applied, already reviewed by the caller. */
  readonly rules: readonly GroupRule[];
  readonly problems: readonly GroupRuleProblem[];
  readonly isEditorOpen: boolean;
  readonly collapsedGroups: ReadonlySet<string>;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleGroup: (key: string) => void;
  readonly onOpenEditor: () => void;
  readonly onCloseEditor: () => void;
  readonly onChangeRules: (rules: readonly GroupRuleDto[]) => void;
}

/**
 * Shows the changed files of the result grouped by the rules the user wrote.
 * Every file lands in exactly one group, and whatever no rule claimed stays in
 * a last group, so nothing under review disappears behind a rule.
 */
export const ConfigGroupView = ({
  entries,
  repositoryPath,
  rulesState,
  rules,
  problems,
  isEditorOpen,
  collapsedGroups,
  selectedFilePath,
  onSelectFile,
  onToggleGroup,
  onOpenEditor,
  onCloseEditor,
  onChangeRules,
}: ConfigGroupViewProps) => {
  if (rulesState.status === "loading" || rulesState.status === "idle") {
    return <p className={styles.empty}>Loading group rules…</p>;
  }
  if (rulesState.status === "error") {
    return (
      <div className={styles.notice}>
        <DiagnosticNote diagnostic={rulesState.diagnostic} />
        <p className={styles.empty}>Tree View and List View are unaffected.</p>
      </div>
    );
  }

  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const groups = groupPathsByRule(entries.map((entry) => entry.path), rules);

  return (
    <div className={styles.configView}>
      <div className={styles.configActions}>
        <button type="button" aria-expanded={isEditorOpen} onClick={onOpenEditor}>
          Edit group rules
        </button>
      </div>

      {isEditorOpen ? (
        <GroupRuleEditor
          repositoryPath={repositoryPath}
          rules={rulesState.rules}
          onChangeRules={onChangeRules}
          onClose={onCloseEditor}
        />
      ) : null}

      {rulesState.saveDiagnostic === null ? null : (
        <DiagnosticNote diagnostic={rulesState.saveDiagnostic} />
      )}

      {distinctProblems(problems).map(([key, problem]) => (
        <p key={key} className={styles.problem}>
          {problem.subject}: {problem.message} {problem.nextAction}
        </p>
      ))}

      {/*
        * Guidance is for a repository that has no rules at all. A repository
        * whose only rules were left out keeps the file list, so the problems
        * above are read next to what they cost.
        */}
      {rulesState.rules.length === 0 ? (
        <div className={styles.notice}>
          <p>No group rules for this repository yet.</p>
          <p className={styles.empty}>
            A rule pairs a repository path prefix such as src/test with a group name.
            Add one to group the changed files of this repository.
          </p>
          <RuleLocationNote repositoryPath={repositoryPath} />
          <button type="button" onClick={onOpenEditor}>Add a rule</button>
        </div>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>No changed files in this result.</p>
      ) : (
        <ul className={styles.groupList}>
          {groups.map((group) => (
            <li key={group.key}>
              <FileGroup
                group={group}
                entriesByPath={entriesByPath}
                isExpanded={!collapsedGroups.has(group.key)}
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
                onToggleGroup={onToggleGroup}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface FileGroupProps {
  readonly group: PathGroup;
  readonly entriesByPath: ReadonlyMap<string, ReviewEntry>;
  readonly isExpanded: boolean;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleGroup: (key: string) => void;
}

const FileGroup = ({
  group,
  entriesByPath,
  isExpanded,
  selectedFilePath,
  onSelectFile,
  onToggleGroup,
}: FileGroupProps) => (
  <>
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-label={`${group.name}, ${describeRuleOf(group)}, ${group.paths.length} files`}
      className={styles.directory}
      onClick={() => { onToggleGroup(group.key); }}
    >
      <span className={styles.twisty} aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
      <span className={styles.path}>{group.name}</span>
      <span className={styles.groupCount} aria-hidden="true">{group.paths.length}</span>
    </button>
    {isExpanded ? (
      group.paths.length === 0 ? (
        <p className={styles.empty}>No changed files under {group.prefix}.</p>
      ) : (
        <ul className={styles.fileList}>
          {group.paths.map((path) => {
            const entry = entriesByPath.get(path);
            return entry === undefined ? null : (
              <li key={path}>
                <FileButton
                  entry={entry}
                  label={path}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={onSelectFile}
                  ruleDescription={describeRuleOf(group)}
                />
              </li>
            );
          })}
        </ul>
      )
    ) : null}
  </>
);

const DiagnosticNote = ({ diagnostic }: Readonly<{ diagnostic: Diagnostic }>) => (
  <p className={styles.problem} role="alert">
    {diagnostic.message} {diagnostic.nextAction}
  </p>
);

/**
 * Two rules can produce the very same problem, and saying it twice adds nothing.
 * The text is also what tells the entries apart, so it doubles as the key.
 */
function distinctProblems(
  problems: readonly GroupRuleProblem[],
): readonly (readonly [string, GroupRuleProblem])[] {
  return [...new Map(problems.map((problem) => [
    `${problem.code}:${problem.subject}:${problem.message}`,
    problem,
  ]))];
}

/** How the group came to hold a file, for the row and for assistive technology. */
function describeRuleOf(group: PathGroup): string {
  return group.prefix === null
    ? "no rule matched"
    : `rule ${group.prefix} to ${group.name}`;
}
