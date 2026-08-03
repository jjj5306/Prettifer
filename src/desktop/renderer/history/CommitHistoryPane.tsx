import { useEffect, useRef } from "react";

import type { RepositoryCommitDto } from "../../shared/index.js";
import type { RangeState } from "../state/app-state.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import styles from "./CommitHistoryPane.module.css";

interface CommitHistoryPaneProps {
  readonly range: RangeState;
  readonly selectedCommitIds: readonly string[];
  readonly mergeParents: Readonly<Record<string, number>>;
  readonly inspectedCommitId: string | null;
  readonly onToggleCommit: (commitId: string) => void;
  readonly onChooseMainlineParent: (commitId: string, mainlineParent: number) => void;
  readonly onInspectCommit: (commitId: string) => void;
  readonly onLoadMore: () => void | Promise<void>;
}

export const CommitHistoryPane = ({
  range,
  selectedCommitIds,
  mergeParents,
  inspectedCommitId,
  onToggleCommit,
  onChooseMainlineParent,
  onInspectCommit,
  onLoadMore,
}: CommitHistoryPaneProps) => {
  const firstCommitRef = useRef<HTMLInputElement>(null);
  const firstCommitButtonRef = useRef<HTMLButtonElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const restorePageFocus = useRef(false);

  useEffect(() => {
    if (
      restorePageFocus.current &&
      range.status === "ready" &&
      range.pagination.status !== "loading"
    ) {
      restorePageFocus.current = false;
      (
        loadMoreRef.current ??
        firstCommitRef.current ??
        firstCommitButtonRef.current
      )?.focus();
    }
  }, [range]);

  if (range.status === "idle") {
    return (
      <section
        id="commit-history"
        className={styles.panel}
        aria-label="Commit History"
        tabIndex={-1}
      >
        <p>Load a comparison range to view commits.</p>
      </section>
    );
  }
  if (range.status === "loading") {
    return (
      <section
        id="commit-history"
        className={styles.panel}
        aria-label="Commit History"
        aria-live="polite"
        tabIndex={-1}
      >
        <p>Loading commit history…</p>
      </section>
    );
  }
  if (range.status === "error" || range.status === "stale") {
    return (
      <section
        id="commit-history"
        className={styles.panel}
        aria-label="Commit History"
        tabIndex={-1}
      >
        <DiagnosticMessage diagnostic={range.diagnostic} />
      </section>
    );
  }

  const selected = new Set(selectedCommitIds);
  const commitsInDisplayOrder = [...range.commits].reverse();
  const firstSelectableCommitId = commitsInDisplayOrder.find(
    (commit) => commit.selectable,
  )?.id;
  const firstCommitId = commitsInDisplayOrder[0]?.id;

  const handleLoadMore = (): void => {
    restorePageFocus.current = true;
    void onLoadMore();
  };

  return (
    <section
      id="commit-history"
      className={`${styles.panel} ${styles.readyPanel}`}
      aria-labelledby="commit-history-heading"
      tabIndex={-1}
    >
      <div className={styles.headingRow}>
        <h2 id="commit-history-heading">Commit History</h2>
        <strong>{selectedCommitIds.length} selected</strong>
      </div>
      {range.commits.length === 0 ? (
        <p>No commits are available in this range. Choose another branch range.</p>
      ) : (
        <ol className={styles.commitList} aria-label="First-parent commits, oldest first">
          {commitsInDisplayOrder.map((commit) => {
            const isInspected = inspectedCommitId === commit.id;
            const isSelected = selected.has(commit.id);
            // The card and the checkbox both choose the commit, so they say the
            // same thing to assistive technology.
            const selectionLabel = commit.selectable
              ? `Include in selected result: ${commit.title}`
              : `Cannot include in selected result: ${commit.title}`;
            return (
              <li
                key={commit.id}
                className={[
                  styles.commitRow,
                  isSelected ? styles.selectedRow : "",
                  isInspected ? styles.inspectedRow : "",
                ].join(" ")}
              >
                <label className={styles.selection}>
                  <input
                    ref={commit.id === firstSelectableCommitId ? firstCommitRef : undefined}
                    type="checkbox"
                    checked={isSelected}
                    disabled={!commit.selectable}
                    aria-label={selectionLabel}
                    onChange={() => { onToggleCommit(commit.id); }}
                  />
                </label>
                <button
                  ref={commit.id === firstCommitId ? firstCommitButtonRef : undefined}
                  type="button"
                  title={commit.title}
                  className={styles.commitButton}
                  aria-current={isInspected ? "true" : undefined}
                  aria-pressed={commit.selectable ? isSelected : undefined}
                  aria-label={[
                    selectionLabel,
                    commit.id,
                    commit.authorName,
                    commit.authoredAt,
                    ...mergeAccessibleState(commit, isSelected, mergeParents[commit.id]),
                  ].join(" · ")}
                  onClick={() => {
                    // The card is the wide target for choosing, and it is the
                    // only control that moves the inspected mark, so a click
                    // does both. The checkbox leaves the mark where it was,
                    // which is what keeps the two states distinguishable.
                    onInspectCommit(commit.id);
                    if (commit.selectable) {
                      onToggleCommit(commit.id);
                    }
                  }}
                >
                  <span className={styles.commitTitle}>{commit.title}</span>
                  <span className={styles.metadata}>
                    <code title={commit.id}>{commit.shortId}</code>
                    <time dateTime={commit.authoredAt} title={commit.authoredAt}>
                      {authoredMonthDay(commit.authoredAt)}
                    </time>
                    <span>{commit.authorName}</span>
                  </span>
                </button>
                {commit.isMerge ? (
                  <MainlineParentPicker
                    commit={commit}
                    isSelected={isSelected}
                    mainlineParent={mergeParents[commit.id]}
                    onChoose={onChooseMainlineParent}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {range.nextOffset === null ? null : (
        <button
          ref={loadMoreRef}
          type="button"
          disabled={range.pagination.status === "loading"}
          onClick={handleLoadMore}
        >
          {range.pagination.status === "loading"
            ? "Loading older commits…"
            : "Load 100 older commits"}
        </button>
      )}
      {range.pagination.status === "error" ? (
        <DiagnosticMessage diagnostic={range.pagination.diagnostic} />
      ) : null}
    </section>
  );
};

/**
 * The commit card is one line, so only the authored month and day are shown.
 * The full timestamp stays available as the machine-readable and hover value.
 */
function authoredMonthDay(authoredAt: string): string {
  const authoredDay = authoredAt.split("T")[0] ?? authoredAt;
  const [, month, dayOfMonth] = authoredDay.split("-");
  if (month === undefined || dayOfMonth === undefined) {
    return authoredDay;
  }
  return `${month}-${dayOfMonth}`;
}

interface MainlineParentPickerProps {
  readonly commit: RepositoryCommitDto;
  readonly isSelected: boolean;
  readonly mainlineParent: number | undefined;
  readonly onChoose: (commitId: string, mainlineParent: number) => void;
}

/**
 * A merge needs a mainline parent before it can be composed, so the choice is
 * offered on the card itself and only matters once the merge is selected.
 */
const MainlineParentPicker = ({
  commit,
  isSelected,
  mainlineParent,
  onChoose,
}: MainlineParentPickerProps) => {
  const needsChoice = isSelected && mainlineParent === undefined;
  return (
    <div className={styles.mainlineParent}>
      <label>
        <span className={styles.mainlineParentLabel}>
          {needsChoice ? "Parent needed" : "Parent"}
        </span>
        <select
          value={mainlineParent === undefined ? "" : String(mainlineParent)}
          aria-label={`Mainline parent for merge commit: ${commit.title}`}
          aria-invalid={needsChoice ? "true" : undefined}
          onChange={(event) => {
            onChoose(commit.id, Number(event.target.value));
          }}
        >
          <option value="" disabled>Choose</option>
          {commit.parentIds.map((parentId, index) => (
            <option key={parentId} value={String(index + 1)}>
              {`${String(index + 1)}: ${parentId.slice(0, 7)}`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

/** Tells assistive technology whether a selected merge still needs a parent. */
function mergeAccessibleState(
  commit: RepositoryCommitDto,
  isSelected: boolean,
  mainlineParent: number | undefined,
): string[] {
  if (!commit.isMerge) {
    return [];
  }
  if (!isSelected) {
    return ["Merge commit"];
  }
  return mainlineParent === undefined
    ? ["Merge commit needs a mainline parent"]
    : [`Merge commit using parent ${String(mainlineParent)}`];
}
