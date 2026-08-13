import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import type { FileHistoryState } from "../state/app-state.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import { panelClass } from "../panel-class.js";
import styles from "./FileHistoryPane.module.css";

interface FileHistoryPaneProps {
  readonly isCurrentRegion: boolean;
  readonly history: FileHistoryState;
  readonly selectedCommits?: readonly string[];
  readonly result?: CompositeDiffResultDto;
  readonly onFocusCommit: (commitId: string) => void;
  readonly onOpenCommit: (commitId: string, path: string) => void;
  readonly onLoadMore: () => void;
  readonly onReturnToResult: () => void;
}

type CompositeProblem = CompositeDiffResultDto["problemFiles"][number];

const historyScrollPositions = new Map<string, number>();

export const FileHistoryPane = ({
  isCurrentRegion,
  history,
  selectedCommits = [],
  result,
  onFocusCommit,
  onOpenCommit,
  onLoadMore,
  onReturnToResult,
}: FileHistoryPaneProps) => {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLOListElement>(null);
  const entries = history.status === "ready" ? [...history.entries].reverse() : [];
  const historyKey = history.status === "ready"
    ? `${history.rangeRevision}:${history.path}`
    : null;
  const selected = useMemo(() => new Set(selectedCommits), [selectedCommits]);
  const contributions = history.status === "ready" && result !== undefined
    ? new Set(result.fileContributions?.find((item) => item.path === history.path)?.commits ?? [])
    : new Set<string>();
  const problems = history.status === "ready" && result !== undefined
    ? new Map<string, CompositeProblem>(
        result.problemFiles
          .filter((problem) => problem.path === history.path)
          .map((problem) => [problem.commit, problem]),
      )
    : new Map<string, CompositeProblem>();

  useEffect(() => {
    if (history.status === "ready" && isCurrentRegion && history.focusedCommitId !== null) {
      buttons.current.get(history.focusedCommitId)?.focus();
    }
  }, [history, isCurrentRegion]);

  useLayoutEffect(() => {
    if (historyKey === null) {
      return undefined;
    }
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = historyScrollPositions.get(historyKey) ?? 0;
    }
    return () => {
      if (list !== null) {
        historyScrollPositions.set(historyKey, list.scrollTop);
      }
    };
  }, [historyKey]);

  const move = (current: string, key: string): void => {
    const index = entries.findIndex((entry) => entry.id === current);
    const target = key === "Home"
      ? entries[0]
      : key === "End"
        ? entries.at(-1)
        : entries[index + (key === "ArrowDown" ? 1 : -1)];
    if (target !== undefined) {
      onFocusCommit(target.id);
      buttons.current.get(target.id)?.focus();
    }
  };

  return (
    // A focused history region handles Escape even when no commit is available. (#14)
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      id="file-history"
      className={panelClass(styles.panel, isCurrentRegion)}
      aria-labelledby="file-history-heading"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onReturnToResult();
        }
      }}
    >
      <header className={styles.heading}>
        <div className={styles.headingRow}>
          <h2 id="file-history-heading">File History</h2>
          <button type="button" onClick={onReturnToResult}>Return to Selected Result</button>
        </div>
        <p title={history.status === "idle" ? undefined : history.path}>
          {history.status === "idle" ? "Select a file to inspect its history." : history.path}
        </p>
      </header>
      {history.status === "idle" ? <p>Open File History for the selected file.</p> : null}
      {history.status === "loading" ? <p aria-live="polite">Loading file history…</p> : null}
      {history.status === "error" ? <DiagnosticMessage diagnostic={history.diagnostic} /> : null}
      {history.status === "ready" ? (
        <>
          {history.partial === null ? null : (
            <div className={styles.partial} role="status">
              <strong>Partial history</strong>
              <p>{history.partial.message}</p>
              <p>{history.partial.nextAction}</p>
            </div>
          )}
          {entries.length === 0 ? <p>No commits changed this file.</p> : (
            <ol ref={listRef} className={styles.list} aria-label="File commits, oldest first">
              {entries.map((entry) => {
                const problem = problems.get(entry.id);
                const state = problem !== undefined
                  ? "Problem"
                  : contributions.has(entry.id)
                    ? "Contributes"
                    : selected.has(entry.id)
                      ? "Selected"
                      : null;
                return (
                  <li key={entry.id} className={styles.item}>
                    <button
                      ref={(node) => {
                        if (node === null) buttons.current.delete(entry.id);
                        else buttons.current.set(entry.id, node);
                      }}
                      type="button"
                      tabIndex={history.focusedCommitId === entry.id ? 0 : -1}
                      className={[
                        styles.commit,
                        contributions.has(entry.id) ? styles.contribution : "",
                        problem === undefined ? "" : styles.problem,
                      ].join(" ")}
                      aria-current={history.focusedCommitId === entry.id ? "true" : undefined}
                      aria-label={[
                        entry.title,
                        entry.id,
                        entry.authorName,
                        entry.authoredAt,
                        changeLabel(entry),
                        state,
                      ].filter(Boolean).join(" · ")}
                      onFocus={() => { onFocusCommit(entry.id); }}
                      onClick={() => { onOpenCommit(entry.id, entry.path); }}
                      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                          event.preventDefault();
                          move(entry.id, event.key);
                        }
                      }}
                    >
                      <span className={styles.title}>{entry.title}</span>
                      <span className={styles.meta}>
                        <code>{entry.shortId}</code>
                        <time dateTime={entry.authoredAt}>{entry.authoredAt.slice(0, 10)}</time>
                        <span>{entry.authorName}</span>
                      </span>
                      <span className={styles.change}>{changeLabel(entry)}</span>
                      {state === null ? null : <strong className={styles.state}>{state}</strong>}
                    </button>
                    {problem === undefined ? null : <p>{problem.nextAction}</p>}
                  </li>
                );
              })}
            </ol>
          )}
          {history.nextOffset === null ? null : (
            <button
              type="button"
              disabled={history.pagination.status === "loading"}
              onClick={onLoadMore}
            >
              {history.pagination.status === "loading"
                ? "Loading 100 older commits…"
                : "Load 100 older commits"}
            </button>
          )}
          {history.pagination.status === "error"
            ? <DiagnosticMessage diagnostic={history.pagination.diagnostic} />
            : null}
        </>
      ) : null}
    </section>
  );
};

function changeLabel(entry: Readonly<{
  status: string;
  path: string;
  previousPath?: string | undefined;
  similarity?: number | undefined;
}>): string {
  if (entry.status === "renamed" && entry.previousPath !== undefined) {
    return `Renamed ${entry.previousPath} to ${entry.path}` +
      (entry.similarity === undefined ? "" : ` · ${String(entry.similarity)}% match`);
  }
  return `${entry.status[0]?.toUpperCase() ?? ""}${entry.status.slice(1)} ${entry.path}`;
}
