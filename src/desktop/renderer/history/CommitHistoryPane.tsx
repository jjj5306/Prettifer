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
    return <section className={styles.panel}><p>브랜치 범위를 먼저 불러와 주세요.</p></section>;
  }
  if (range.status === "loading") {
    return <section className={styles.panel} aria-live="polite"><p>커밋 이력을 불러오는 중입니다.</p></section>;
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
        <h2 id="commit-history-heading">커밋 이력</h2>
        <strong>통합 선택 {selectedCommitIds.length}개</strong>
      </div>
      {selectedCommitIds.length === 0 ? (
        <p className={styles.hint}>통합 결과를 만들려면 하나 이상의 커밋을 선택해 주세요.</p>
      ) : null}
      {range.commits.length === 0 ? (
        <p>선택한 브랜치 범위에 표시할 커밋이 없습니다. 다른 브랜치 범위를 선택해 주세요.</p>
      ) : (
        <ol className={styles.commitList} aria-label="최신순 first-parent 커밋">
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
                      ? `통합에 포함: ${commit.title}`
                      : `통합에 포함할 수 없음: ${commit.title}`}
                    onChange={() => { onToggleCommit(commit.id); }}
                  />
                  <span aria-hidden="true">통합</span>
                </label>
                <button
                  type="button"
                  className={styles.commitButton}
                  aria-current={isInspected ? "true" : undefined}
                  aria-label={isInspected
                    ? `현재 탐색: ${commit.title}`
                    : `커밋 자세히 보기: ${commit.title}`}
                  onClick={() => { onInspectCommit(commit.id); }}
                >
                  <span className={styles.commitTitle}>{commit.title}</span>
                  <span className={styles.metadata}>
                    <code>{commit.shortId}</code>
                    <span>{commit.authorName}</span>
                    <time dateTime={commit.authoredAt}>{commit.authoredAt}</time>
                  </span>
                  {commit.isMerge ? (
                    <span className={styles.merge}>병합 커밋 · 선택할 수 없음</span>
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
            ? "이전 커밋 불러오는 중"
            : "이전 커밋 100개 더 불러오기"}
        </button>
      )}
      {range.pagination.status === "error" ? (
        <DiagnosticMessage diagnostic={range.pagination.diagnostic} />
      ) : null}
      <CommitDetails commit={inspected} />
    </section>
  );
};
