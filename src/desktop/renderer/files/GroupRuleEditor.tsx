import { useId, useState, type SyntheticEvent } from "react";

import type { GroupRuleDto } from "../../shared/index.js";
import {
  checkGroupRule,
  normalizeGroupName,
  normalizeGroupPrefix,
  type GroupRuleProblem,
} from "../../../grouping/group-rule.js";
import { RuleLocationNote } from "./RuleLocationNote.js";
import styles from "./ChangedFilePane.module.css";

interface GroupRuleEditorProps {
  readonly repositoryPath: string;
  readonly rules: readonly GroupRuleDto[];
  readonly onChangeRules: (rules: readonly GroupRuleDto[]) => void;
  readonly onClose: () => void;
}

const emptyDraft = { prefix: "", name: "" } as const;

/**
 * Writes the rule list of the open repository. A rule is checked against the
 * rules that already exist before it joins them, so what the panel holds can
 * always be applied and a rejected entry stays in the form to be corrected.
 */
export const GroupRuleEditor = ({
  repositoryPath,
  rules,
  onChangeRules,
  onClose,
}: GroupRuleEditorProps) => {
  const fieldId = useId();
  const [draft, setDraft] = useState<GroupRuleDto>(emptyDraft);
  const [editedIndex, setEditedIndex] = useState<number | null>(null);
  const [problem, setProblem] = useState<GroupRuleProblem | null>(null);

  const others = rules.filter((_unused, index) => index !== editedIndex);

  const handleSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const found = checkGroupRule(draft, others);
    if (found !== null) {
      setProblem(found);
      return;
    }
    const saved = {
      prefix: normalizeGroupPrefix(draft.prefix),
      name: normalizeGroupName(draft.name),
    };
    onChangeRules(
      editedIndex === null
        ? [...rules, saved]
        : rules.map((rule, index) => (index === editedIndex ? saved : rule)),
    );
    setDraft(emptyDraft);
    setEditedIndex(null);
    setProblem(null);
  };

  const handleEdit = (index: number): void => {
    const rule = rules[index];
    if (rule === undefined) {
      return;
    }
    setDraft({ prefix: rule.prefix, name: rule.name });
    setEditedIndex(index);
    setProblem(null);
  };

  const handleDelete = (index: number): void => {
    onChangeRules(rules.filter((_unused, position) => position !== index));
    if (editedIndex === index) {
      setDraft(emptyDraft);
      setEditedIndex(null);
    }
    setProblem(null);
  };

  const handleMove = (index: number, offset: number): void => {
    const target = index + offset;
    const moved = rules[index];
    const displaced = rules[target];
    if (moved === undefined || displaced === undefined) {
      return;
    }
    onChangeRules(rules.map((rule, position) => {
      if (position === index) {
        return displaced;
      }
      return position === target ? moved : rule;
    }));
  };

  return (
    <section className={styles.editor} aria-label="Group rules">
      <RuleLocationNote repositoryPath={repositoryPath} />
      <form className={styles.editorForm} onSubmit={handleSubmit}>
        <label htmlFor={`${fieldId}-prefix`}>Path prefix</label>
        <input
          id={`${fieldId}-prefix`}
          value={draft.prefix}
          placeholder="src/test"
          onChange={(event) => { setDraft({ ...draft, prefix: event.target.value }); }}
        />
        <label htmlFor={`${fieldId}-name`}>Group name</label>
        <input
          id={`${fieldId}-name`}
          value={draft.name}
          placeholder="Tests"
          onChange={(event) => { setDraft({ ...draft, name: event.target.value }); }}
        />
        <div className={styles.editorActions}>
          <button type="submit">{editedIndex === null ? "Add rule" : "Save rule"}</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </form>

      {problem === null ? null : (
        <p className={styles.problem} role="alert">
          {problem.message} {problem.nextAction}
        </p>
      )}

      {rules.length === 0 ? null : (
        <ol className={styles.editorList}>
          {rules.map((rule, index) => (
            <li key={rule.prefix} className={styles.editorRow}>
              <span className={styles.path}>{rule.name}</span>
              <span className={styles.rulePrefix}>{rule.prefix}</span>
              <button
                type="button"
                aria-label={`Move ${rule.name} up`}
                disabled={index === 0}
                onClick={() => { handleMove(index, -1); }}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${rule.name} down`}
                disabled={index === rules.length - 1}
                onClick={() => { handleMove(index, 1); }}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Edit ${rule.name}`}
                onClick={() => { handleEdit(index); }}
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Delete ${rule.name}`}
                onClick={() => { handleDelete(index); }}
              >
                Delete
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
