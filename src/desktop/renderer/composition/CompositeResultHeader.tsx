import type { RepositoryRangeDto } from "../../shared/index.js";
import type { CompositionState } from "../state/app-state.js";

type CompositionReadyResult = Extract<CompositionState, { status: "ready" }>["result"];
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
  readonly onSelectFile: (path: string) => void;
}

export const CompositeResultHeader = ({
  composition,
  range,
  selectedCount,
  pendingMainlineParents,
  onCompose,
  onCancel,
  onSelectFile,
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
    {composition.status === "ready" && composition.result.problemFiles.length > 0 ? (
      <ProblemSummary
        problemFiles={composition.result.problemFiles}
        onSelectFile={onSelectFile}
      />
    ) : null}
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

interface ProblemSummaryProps {
  readonly problemFiles: CompositionReadyResult["problemFiles"];
  readonly onSelectFile: (path: string) => void;
}

/**
 * A result with problem files is not known to be runnable, so the summary says
 * so and offers a way straight to the first problem.
 */
const ProblemSummary = ({ problemFiles, onSelectFile }: ProblemSummaryProps) => {
  const first = problemFiles[0];
  return (
    <div className={styles.problemSummary} role="status">
      <strong>Partial result</strong>
      <span>
        {problemFiles.length === 1
          ? "1 file needs a content choice and was left at the comparison base."
          : `${String(problemFiles.length)} files need a content choice and were left at the comparison base.`}
      </span>
      {first === undefined ? null : (
        <button type="button" onClick={() => { onSelectFile(first.path); }}>
          Review first problem file
        </button>
      )}
    </div>
  );
};
