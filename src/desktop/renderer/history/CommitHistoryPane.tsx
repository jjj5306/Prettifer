import { useEffect, useRef } from "react";

import type { RangeState } from "../state/app-state.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import styles from "./CommitHistoryPane.module.css";

interface CommitHistoryPaneProps {
  readonly range: RangeState;
  readonly selectedCommitIds: readonly string[];
  readonly inspectedCommitId: string | null;
  readonly onToggleCommit: (commitId: string) => void;
  readonly onInspectCommit: (commitId: string) => void;
  readonly onLoadMore: () => void | Promise<void>;
}

export const CommitHistoryPane = ({
  range,
  selectedCommitIds,
  inspectedCommitId,
  onToggleCommit,
  onInspectCommit,
  onLoadMore,
}: CommitHistoryPaneProps) => {
  const firstCommitRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const restorePageFocus = useRef(false);

  useEffect(() => {
    if (
      restorePageFocus.current &&
      range.status === "ready" &&
      range.pagination.status !== "loading"
    ) {
      restorePageFocus.current = false;
      (loadMoreRef.current ?? firstCommitRef.current)?.focus();
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
                    checked={selected.has(commit.id)}
                    disabled={!commit.selectable}
                    aria-label={commit.selectable
                      ? `Include in selected result: ${commit.title}`
                      : `Cannot include in selected result: ${commit.title}`}
                    onChange={() => { onToggleCommit(commit.id); }}
                  />
                </label>
                <button
                  type="button"
                  title={commit.title}
                  className={styles.commitButton}
                  aria-current={isInspected ? "true" : undefined}
                  aria-pressed={commit.selectable ? isSelected : undefined}
                  aria-label={commit.selectable
                    ? `${isSelected ? "Deselect" : "Select"} and inspect commit: ${commit.title}`
                    : `Inspect unavailable commit: ${commit.title}`}
                  onClick={() => {
                    if (commit.selectable) {
                      onToggleCommit(commit.id);
                    }
                    onInspectCommit(commit.id);
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
                  {commit.isMerge ? (
                    <span className={styles.merge}>Merge commit · unavailable</span>
                  ) : null}
                </button>
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
