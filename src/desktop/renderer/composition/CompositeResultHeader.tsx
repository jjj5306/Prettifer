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
        <h2 id="composite-result-heading">통합 결과</h2>
      </div>
      {composition.status === "loading" ? (
        <button type="button" onClick={() => { void onCancel(); }}>계산 취소</button>
      ) : (
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={() => { void onCompose(); }}
        >
          {composition.status === "idle" ? "통합 결과 만들기" : "통합 결과 다시 만들기"}
        </button>
      )}
    </div>
    <OperationStatus composition={composition} selectedCount={selectedCount} />
    {composition.status === "ready" ? (
      <dl className={styles.summary}>
        <div><dt>범위</dt><dd>{range.baseRef} → {range.headRef}</dd></div>
        <div><dt>비교 기준</dt><dd>실제 비교 기준: {composition.result.baseCommit}</dd></div>
        <div>
          <dt>포함</dt>
          <dd>
            포함 커밋 {composition.result.selectedCommits.length}개 · 현재 선택과
            {composition.result.selectedCommits.length === selectedCount ? " 일치" : " 다름"}
          </dd>
        </div>
        <div>
          <dt>적용</dt>
          <dd>적용 순서: {composition.result.selectedCommits.join(" → ")}</dd>
        </div>
        <div><dt>저장소</dt><dd>사용자 작업 트리 보존 확인</dd></div>
      </dl>
    ) : null}
  </section>
);
