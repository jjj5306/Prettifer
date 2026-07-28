import { useEffect, useRef, useState, type RefObject } from "react";

export interface PaneWidthLimits {
  readonly minimum: number;
  readonly maximum: number;
  /** Width the neighbouring pane keeps when the splitter is dragged to its end. */
  readonly minimumRemaining: number;
}

/** Width state handed to the splitter; holds no ref so it is safe to pass in JSX. */
export interface PaneWidthControl {
  readonly width: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly setWidth: (width: number) => void;
  readonly setWidthFromPointer: (clientX: number) => void;
}

export interface ResizablePane {
  /** Attach to the element the pane width is measured against. */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly control: PaneWidthControl;
}

/**
 * Owns the width of a resizable pane. The stored value is the width the user
 * asked for; the reported width is that value clamped to the room the
 * container currently has, so a smaller window never starves either pane.
 */
export function useResizablePane(
  limits: PaneWidthLimits,
  initialWidth: number,
): ResizablePane {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [requestedWidth, setRequestedWidth] = useState(initialWidth);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const measure = (): void => {
      setContainerWidth(containerRef.current?.getBoundingClientRect().width ?? 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("resize", measure); };
  }, []);

  const maximum = containerWidth <= 0
    // The container is not laid out yet, so only the absolute limit applies.
    ? limits.maximum
    : clamp(containerWidth - limits.minimumRemaining, limits.minimum, limits.maximum);

  return {
    containerRef,
    control: {
      width: Math.round(clamp(requestedWidth, limits.minimum, maximum)),
      minimum: limits.minimum,
      maximum,
      setWidth: (width) => { setRequestedWidth(clamp(width, limits.minimum, maximum)); },
      setWidthFromPointer: (clientX) => {
        const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
        setRequestedWidth(clamp(clientX - containerLeft, limits.minimum, maximum));
      },
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
