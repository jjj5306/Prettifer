import type { CompositionState } from "../state/app-state.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import styles from "./CompositeResultHeader.module.css";

interface OperationStatusProps {
  readonly composition: CompositionState;
  readonly selectedCount: number;
}

export const OperationStatus = ({ composition, selectedCount }: OperationStatusProps) => {
  switch (composition.status) {
    case "idle":
      return (
        <p className={styles.status} aria-live="polite">
          {selectedCount === 0
            ? "하나 이상의 합성 가능 커밋을 선택해 주세요."
            : `${String(selectedCount)}개 커밋을 선택했습니다.`}
        </p>
      );
    case "loading":
      return <p className={styles.status} aria-live="polite">통합 결과를 계산하는 중입니다.</p>;
    case "cancelled":
      return (
        <p className={styles.status} aria-live="polite">
          계산을 취소했습니다. 선택한 커밋으로 다시 계산할 수 있습니다.
        </p>
      );
    case "error":
      return <DiagnosticMessage className={styles.error} diagnostic={composition.diagnostic} />;
    case "ready":
      return (
        <p className={styles.status} aria-live="polite">
          {composition.result.files.length === 0
            ? "계산은 성공했으며 변경 파일이 없습니다."
            : `계산 완료 · 변경 파일 ${String(composition.result.files.length)}개`}
        </p>
      );
  }
};
