import { useEffect, useRef } from "react";

import type { RangeState } from "../state/app-state.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import { CommitDetails } from "./CommitDetails.js";
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
    return <section className={styles.panel}><p>Load a comparison range to view commits.</p></section>;
  }
  if (range.status === "loading") {
    return <section className={styles.panel} aria-live="polite"><p>Loading commit history…</p></section>;
  }
  if (range.status === "error" || range.status === "stale") {
    return (
      <section className={styles.panel}>
        <DiagnosticMessage diagnostic={range.diagnostic} />
      </section>
    );
  }

  const selected = new Set(selectedCommitIds);
  const inspected = range.commits.find((commit) => commit.id === inspectedCommitId) ?? null;

  const handleLoadMore = (): void => {
    restorePageFocus.current = true;
    void onLoadMore();
  };

  return (
    <section className={styles.panel} aria-labelledby="commit-history-heading">
      <div className={styles.headingRow}>
        <h2 id="commit-history-heading">Commit Timeline</h2>
        <strong>{selectedCommitIds.length} selected</strong>
      </div>
      {selectedCommitIds.length === 0 ? (
        <p className={styles.hint}>Select at least one supported commit to build a result.</p>
      ) : null}
      {range.commits.length === 0 ? (
        <p>No commits are available in this range. Choose another branch range.</p>
      ) : (
        <ol className={styles.commitList} aria-label="First-parent commits, newest first">
          {range.commits.map((commit, index) => {
            const isInspected = inspectedCommitId === commit.id;
            return (
              <li
                key={commit.id}
                className={isInspected ? styles.inspectedRow : styles.commitRow}
              >
                <label className={styles.selection}>
                  <input
                    ref={index === 0 ? firstCommitRef : undefined}
                    type="checkbox"
                    checked={selected.has(commit.id)}
                    disabled={!commit.selectable}
                    aria-label={commit.selectable
                      ? `Include in selected result: ${commit.title}`
                      : `Cannot include in selected result: ${commit.title}`}
                    onChange={() => { onToggleCommit(commit.id); }}
                  />
                  <span aria-hidden="true">Select</span>
                </label>
                <button
                  type="button"
                  className={styles.commitButton}
                  aria-current={isInspected ? "true" : undefined}
                  aria-label={isInspected
                    ? `Currently inspecting: ${commit.title}`
                    : `Inspect commit: ${commit.title}`}
                  onClick={() => { onInspectCommit(commit.id); }}
                >
                  <span className={styles.commitTitle}>{commit.title}</span>
                  <span className={styles.metadata}>
                    <code>{commit.shortId}</code>
                    <span>{commit.authorName}</span>
                    <time dateTime={commit.authoredAt}>{commit.authoredAt}</time>
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
      <CommitDetails commit={inspected} />
    </section>
  );
};
