import type { SyntheticEvent } from "react";

import type { RepositorySession } from "../../shared/index.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import { selectRepositorySession } from "../state/app-selectors.js";
import type { RangeState, RepositoryState } from "../state/app-state.js";
import styles from "./RepositoryToolbar.module.css";

interface RepositoryToolbarProps {
  readonly repository: RepositoryState;
  readonly range: RangeState;
  readonly onOpenRepository: () => void | Promise<void>;
  readonly onLoadRange: (baseRef: string, headRef: string) => void | Promise<void>;
}

export const RepositoryToolbar = ({
  repository,
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
    <section className={styles.toolbar} aria-labelledby="repository-heading">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Repository</p>
          <h2 id="repository-heading">Repository and comparison range</h2>
        </div>
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
          <dl className={styles.repositorySummary}>
            <div>
              <dt>Repository path</dt>
              <dd>{session.rootPath}</dd>
            </div>
            <div>
              <dt>Current state</dt>
              <dd>Current branch: {session.currentBranch ?? "Detached HEAD"}</dd>
            </div>
          </dl>
          <form
            key={session.repositorySessionId}
            className={styles.rangeForm}
            onSubmit={handleRangeSubmit}
          >
            <label>
              Base branch
              <select
                name="baseRef"
                defaultValue={defaultBaseRef(session, range)}
                disabled={range.status === "loading"}
              >
                {session.branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </label>
            <label>
              Working branch
              <select
                name="headRef"
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
            <p className={styles.rangeSummary}>Common ancestor: {range.range.baseCommit}</p>
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
