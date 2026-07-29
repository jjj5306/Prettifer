import type { RepositoryRangeDto } from "../../shared/index.js";
import type { CompositionState } from "../state/app-state.js";
import { OperationStatus } from "./OperationStatus.js";
import styles from "./CompositeResultHeader.module.css";

interface CompositeResultHeaderProps {
  readonly composition: CompositionState;
  readonly range: RepositoryRangeDto;
  readonly selectedCount: number;
  /** Selected merge commits that still need a mainline parent. */
  readonly pendingMainlineParents: number;
  readonly onCompose: () => void | Promise<void>;
  readonly onCancel: () => void | Promise<void>;
}

export const CompositeResultHeader = ({
  composition,
  range,
  selectedCount,
  pendingMainlineParents,
  onCompose,
  onCancel,
}: CompositeResultHeaderProps) => (
  <section className={styles.header} aria-labelledby="composite-result-heading">
    <div className={styles.identity}>
      <p className={styles.eyebrow}>Composite result</p>
      <h2 id="composite-result-heading">Selected Result</h2>
    </div>
    <OperationStatus
      composition={composition}
      selectedCount={selectedCount}
      pendingMainlineParents={pendingMainlineParents}
    />
    {composition.status === "ready" ? (
      <dl className={styles.summary}>
        <div><dt>Range</dt><dd>{range.baseRef} → {range.headRef}</dd></div>
        <div>
          <dt>Base</dt>
          <dd><code title={composition.result.baseCommit}>
            {composition.result.baseCommit.slice(0, 7)}
          </code></dd>
        </div>
        <div>
          <dt>Included</dt>
          <dd>
            {composition.result.selectedCommits.length} commits ·
            {composition.result.selectedCommits.length === selectedCount
              ? " matches current selection"
              : " differs from current selection"}
          </dd>
        </div>
        <div>
          <dt>Applied</dt>
          <dd className={styles.commitChain}>
            {composition.result.selectedCommits.map((commit, index) => {
              const mainlineParent = composition.result.mainlineParents[commit];
              return (
                <span key={commit}>
                  {index === 0 ? null : <span aria-hidden="true">→</span>}
                  <code title={commit}>{commit.slice(0, 7)}</code>
                  {mainlineParent === undefined ? null : (
                    <span
                      className={styles.mainlineParent}
                      title={`Composed against parent ${String(mainlineParent)}`}
                    >
                      {`parent ${String(mainlineParent)}`}
                    </span>
                  )}
                </span>
              );
            })}
          </dd>
        </div>
      </dl>
    ) : null}
    {composition.status === "loading" ? (
      <button type="button" onClick={() => { void onCancel(); }}>Cancel</button>
    ) : (
      <button
        type="button"
        disabled={selectedCount === 0 || pendingMainlineParents > 0}
        onClick={() => { void onCompose(); }}
      >
        {composition.status === "idle" ? "Build Selected Result" : "Rebuild Selected Result"}
      </button>
    )}
  </section>
);
