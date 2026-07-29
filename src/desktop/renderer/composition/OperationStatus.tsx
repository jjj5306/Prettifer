import type { CompositionState } from "../state/app-state.js";
import { DiagnosticMessage } from "../errors/DiagnosticMessage.js";
import styles from "./CompositeResultHeader.module.css";

interface OperationStatusProps {
  readonly composition: CompositionState;
  readonly selectedCount: number;
  readonly pendingMainlineParents: number;
}

export const OperationStatus = ({
  composition,
  selectedCount,
  pendingMainlineParents,
}: OperationStatusProps) => {
  switch (composition.status) {
    case "idle":
      return (
        <p className={styles.status} aria-live="polite">
          {idleStatusMessage(selectedCount, pendingMainlineParents)}
        </p>
      );
    case "loading":
      return <p className={styles.status} aria-live="polite">Building selected result…</p>;
    case "cancelled":
      return (
        <p className={styles.status} aria-live="polite">
          Calculation cancelled. You can rebuild with the current selection.
        </p>
      );
    case "error":
      return <DiagnosticMessage className={styles.error} diagnostic={composition.diagnostic} />;
    case "ready":
      return (
        <p className={styles.status} aria-live="polite">
          {composition.result.files.length === 0
            ? "Result built successfully with no changed files."
            : `Result ready · ${String(composition.result.files.length)} changed files`}
        </p>
      );
  }
};

function idleStatusMessage(
  selectedCount: number,
  pendingMainlineParents: number,
): string {
  if (selectedCount === 0) {
    return "Select at least one supported commit.";
  }
  if (pendingMainlineParents > 0) {
    return pendingMainlineParents === 1
      ? "Choose a mainline parent for the selected merge commit."
      : `Choose a mainline parent for ${String(pendingMainlineParents)} selected merge commits.`;
  }
  return `${String(selectedCount)} commits selected.`;
}
