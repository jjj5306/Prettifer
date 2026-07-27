import type { RepositoryRangeDto } from "../../shared/index.js";
import type { CompositionState } from "../state/app-state.js";
import { OperationStatus } from "./OperationStatus.js";
import styles from "./CompositeResultHeader.module.css";

interface CompositeResultHeaderProps {
  readonly composition: CompositionState;
  readonly range: RepositoryRangeDto;
  readonly selectedCount: number;
  readonly onCompose: () => void | Promise<void>;
  readonly onCancel: () => void | Promise<void>;
}

export const CompositeResultHeader = ({
  composition,
  range,
  selectedCount,
  onCompose,
  onCancel,
}: CompositeResultHeaderProps) => (
  <section className={styles.header} aria-labelledby="composite-result-heading">
    <div className={styles.headingRow}>
      <div>
        <p className={styles.eyebrow}>Composite result</p>
        <h2 id="composite-result-heading">Selected Result</h2>
      </div>
      {composition.status === "loading" ? (
        <button type="button" onClick={() => { void onCancel(); }}>Cancel</button>
      ) : (
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={() => { void onCompose(); }}
        >
          {composition.status === "idle" ? "Build Selected Result" : "Rebuild Selected Result"}
        </button>
      )}
    </div>
    <OperationStatus composition={composition} selectedCount={selectedCount} />
    {composition.status === "ready" ? (
      <dl className={styles.summary}>
        <div><dt>Range</dt><dd>{range.baseRef} → {range.headRef}</dd></div>
        <div><dt>Base</dt><dd>{composition.result.baseCommit}</dd></div>
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
          <dd>{composition.result.selectedCommits.join(" → ")}</dd>
        </div>
        <div><dt>Repository</dt><dd>Working tree preserved</dd></div>
      </dl>
    ) : null}
  </section>
);
