import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { PaneWidthControl } from "./use-resizable-pane.js";
import styles from "./PaneSplitter.module.css";

/** Width change applied by a single arrow key press. */
const KEYBOARD_STEP = 16;

interface PaneSplitterProps {
  readonly label: string;
  readonly controls: string;
  readonly pane: PaneWidthControl;
}

/**
 * Vertical window splitter that resizes the pane on its left. The drag uses
 * pointer capture so it keeps following a pointer that leaves the splitter,
 * without a window-level subscription to clean up.
 */
export const PaneSplitter = ({ label, controls, pane }: PaneSplitterProps) => {
  const [draggingPointerId, setDraggingPointerId] = useState<number | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingPointerId(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (draggingPointerId !== event.pointerId) {
      return;
    }
    pane.setWidthFromPointer(event.clientX);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (draggingPointerId !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingPointerId(null);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const requestedWidth = widthForKey(event.key, pane);
    if (requestedWidth === null) {
      return;
    }
    event.preventDefault();
    pane.setWidth(requestedWidth);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- #11: the ARIA window splitter pattern requires pointer and key handlers on role="separator"; the rule has no allowlist for it.
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuenow={pane.width}
      aria-valuemin={pane.minimum}
      aria-valuemax={pane.maximum}
      className={draggingPointerId === null ? styles.splitter : styles.draggingSplitter}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    />
  );
};

function widthForKey(key: string, pane: PaneWidthControl): number | null {
  switch (key) {
    case "ArrowLeft":
      return pane.width - KEYBOARD_STEP;
    case "ArrowRight":
      return pane.width + KEYBOARD_STEP;
    case "Home":
      return pane.minimum;
    case "End":
      return pane.maximum;
    default:
      return null;
  }
}
