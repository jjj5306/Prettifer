import type { SyntheticEvent } from "react";

import type { RepositorySession } from "../../shared/index.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import { panelClass } from "../panel-class.js";
import { selectRepositorySession } from "../state/app-selectors.js";
import type { RangeState, RepositoryState } from "../state/app-state.js";
import styles from "./RepositoryToolbar.module.css";

interface RepositoryToolbarProps {
  /** True while the activity rail points at this region. */
  readonly isCurrentRegion: boolean;
  readonly repository: RepositoryState;
  readonly range: RangeState;
  readonly onOpenRepository: () => void | Promise<void>;
  readonly onLoadRange: (baseRef: string, headRef: string) => void | Promise<void>;
}

export const RepositoryToolbar = ({
  repository,
  isCurrentRegion,
  range,
  onOpenRepository,
  onLoadRange,
}: RepositoryToolbarProps) => {
  const session = selectRepositorySession(repository);
  const diagnostic = repository.status === "error" ? repository.diagnostic : null;

  const handleRangeSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ): void => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const baseRef = values.get("baseRef");
    const headRef = values.get("headRef");
    if (typeof baseRef === "string" && typeof headRef === "string") {
      void onLoadRange(baseRef, headRef);
    }
  };

  return (
    <section
      id="repository-workspace"
      className={panelClass(styles.toolbar, isCurrentRegion)}
      aria-labelledby="repository-heading"
      tabIndex={-1}
    >
      <div className={styles.headingRow}>
        <p className={styles.eyebrow}>Repository</p>
        <h2 id="repository-heading">Repository and comparison range</h2>
        <button
          type="button"
          disabled={repository.status === "selecting"}
          onClick={() => { void onOpenRepository(); }}
        >
          {session === null ? "Open Repository" : "Change Repository"}
        </button>
      </div>

      {session === null ? (
        <p className={styles.empty}>Choose a local Git repository to review.</p>
      ) : (
        <>
          <form
            key={session.repositorySessionId}
            className={styles.rangeForm}
            onSubmit={handleRangeSubmit}
          >
            <label>
              <span>Base</span>
              <select
                name="baseRef"
                aria-label="Base branch"
                defaultValue={defaultBaseRef(session, range)}
                disabled={range.status === "loading"}
              >
                {session.branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Working</span>
              <select
                name="headRef"
                aria-label="Working branch"
                defaultValue={defaultHeadRef(session, range)}
                disabled={range.status === "loading"}
              >
                {session.branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={range.status === "loading"}>
              {range.status === "loading" ? "Loading Commit Range…" : "Load Commit Range"}
            </button>
          </form>
          {range.status === "ready" ? (
            <p className={styles.rangeSummary}>
              Base <code title={range.range.baseCommit}>{range.range.baseCommit.slice(0, 7)}</code>
            </p>
          ) : null}
        </>
      )}

      {diagnostic === null ? null : (
        <DiagnosticMessage className={styles.diagnostic} diagnostic={diagnostic} />
      )}
      {range.status === "error" || range.status === "stale" ? (
        <DiagnosticMessage className={styles.diagnostic} diagnostic={range.diagnostic} />
      ) : null}
    </section>
  );
};

function defaultBaseRef(session: RepositorySession, range: RangeState): string {
  if (range.status === "ready") {
    return range.range.baseRef;
  }
  if (range.status === "loading" || range.status === "error") {
    return range.baseRef;
  }
  if (range.status === "stale") {
    return range.range.baseRef;
  }
  return session.branches.find((branch) => !branch.isCurrent)?.name
    ?? session.branches[0]?.name
    ?? "";
}

function defaultHeadRef(session: RepositorySession, range: RangeState): string {
  if (range.status === "ready") {
    return range.range.headRef;
  }
  if (range.status === "loading" || range.status === "error") {
    return range.headRef;
  }
  if (range.status === "stale") {
    return range.range.headRef;
  }
  return session.branches.find((branch) => branch.isCurrent)?.name
    ?? session.branches[0]?.name
    ?? "";
}
