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
          <h2 id="repository-heading">저장소와 비교 범위</h2>
        </div>
        <button
          type="button"
          disabled={repository.status === "selecting"}
          onClick={() => { void onOpenRepository(); }}
        >
          {session === null ? "저장소 폴더 선택" : "다른 저장소 선택"}
        </button>
      </div>

      {session === null ? (
        <p className={styles.empty}>분석할 로컬 Git 저장소를 선택해 주세요.</p>
      ) : (
        <>
          <dl className={styles.repositorySummary}>
            <div>
              <dt>저장소 경로</dt>
              <dd>{session.rootPath}</dd>
            </div>
            <div>
              <dt>현재 상태</dt>
              <dd>현재 브랜치: {session.currentBranch ?? "분리된 HEAD"}</dd>
            </div>
          </dl>
          <form
            key={session.repositorySessionId}
            className={styles.rangeForm}
            onSubmit={handleRangeSubmit}
          >
            <label>
              비교 기준 브랜치
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
              작업 브랜치
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
              {range.status === "loading" ? "커밋 범위 불러오는 중" : "커밋 범위 불러오기"}
            </button>
          </form>
          {range.status === "ready" ? (
            <p className={styles.rangeSummary}>공통 조상: {range.range.baseCommit}</p>
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
