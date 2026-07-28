// @vitest-environment jsdom

import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PaneSplitter } from "../../../../src/desktop/renderer/layout/PaneSplitter.js";
import {
  useResizablePane,
  type PaneWidthLimits,
} from "../../../../src/desktop/renderer/layout/use-resizable-pane.js";

const limits: PaneWidthLimits = { minimum: 176, maximum: 720, minimumRemaining: 384 };

interface HarnessProps {
  readonly initialWidth?: number;
  readonly containerWidth?: number;
  readonly onRenderWidth?: ((width: number) => void) | undefined;
}

/** Mirrors how the review area hosts the splitter next to a measured container. */
const Harness = ({
  initialWidth = 288,
  containerWidth = 1024,
  onRenderWidth,
}: HarnessProps) => {
  const pane = useResizablePane(limits, initialWidth);
  const [measuredWidth] = useState(containerWidth);
  onRenderWidth?.(pane.control.width);
  return (
    <div
      ref={(element) => {
        if (element !== null) {
          // jsdom does not lay out, so the review area is measured for the hook.
          element.getBoundingClientRect = () =>
            ({ left: 0, width: measuredWidth }) as DOMRect;
        }
        pane.containerRef.current = element;
      }}
    >
      <div id="changed-files" style={{ width: pane.control.width }} />
      <PaneSplitter label="Resize Changed Files" controls="changed-files" pane={pane.control} />
    </div>
  );
};

function splitter(): HTMLElement {
  return screen.getByRole("separator", { name: "Resize Changed Files" });
}

function drag(clientX: number): void {
  const target = splitter();
  fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 288 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX });
  fireEvent.pointerUp(target, { pointerId: 1, clientX });
}

describe("PaneSplitter", () => {
  it("exposes the current width and the measured range to assistive technology", () => {
    render(<StrictMode><Harness /></StrictMode>);

    const separator = splitter();
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-controls", "changed-files");
    expect(separator).toHaveAttribute("aria-valuenow", "288");
    expect(separator).toHaveAttribute("aria-valuemin", "176");
    // The 1024 review area minus the 384 the diff pane keeps.
    expect(separator).toHaveAttribute("aria-valuemax", "640");
  });

  it("widens and narrows the pane while the pointer is dragged", () => {
    render(<StrictMode><Harness /></StrictMode>);

    drag(420);
    expect(splitter()).toHaveAttribute("aria-valuenow", "420");

    drag(240);
    expect(splitter()).toHaveAttribute("aria-valuenow", "240");
  });

  it("keeps both panes usable when the pointer is dragged past either edge", () => {
    render(<StrictMode><Harness /></StrictMode>);

    drag(-500);
    expect(splitter()).toHaveAttribute("aria-valuenow", "176");

    drag(5000);
    expect(splitter()).toHaveAttribute("aria-valuenow", "640");
  });

  it("ignores pointer movement that is not part of an active drag", () => {
    render(<StrictMode><Harness /></StrictMode>);

    fireEvent.pointerMove(splitter(), { pointerId: 1, clientX: 500 });

    expect(splitter()).toHaveAttribute("aria-valuenow", "288");
  });

  it("resizes one step at a time with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<StrictMode><Harness /></StrictMode>);

    splitter().focus();
    expect(splitter()).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(splitter()).toHaveAttribute("aria-valuenow", "304");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(splitter()).toHaveAttribute("aria-valuenow", "272");
  });

  it("jumps to each end of the range with Home and End", async () => {
    const user = userEvent.setup();
    render(<StrictMode><Harness /></StrictMode>);

    splitter().focus();
    await user.keyboard("{Home}");
    expect(splitter()).toHaveAttribute("aria-valuenow", "176");
    await user.keyboard("{End}");
    expect(splitter()).toHaveAttribute("aria-valuenow", "640");
  });

  it("leaves the width unchanged for keys that do not resize", async () => {
    const user = userEvent.setup();
    const renderedWidths: number[] = [];
    render(<StrictMode><Harness onRenderWidth={(width) => renderedWidths.push(width)} /></StrictMode>);

    splitter().focus();
    await user.keyboard("{ArrowUp}{Enter}a");

    expect(splitter()).toHaveAttribute("aria-valuenow", "288");
    expect(new Set(renderedWidths)).toEqual(new Set([288]));
  });

  it("falls back to the absolute maximum before the review area is measured", () => {
    render(<StrictMode><Harness containerWidth={0} /></StrictMode>);

    expect(splitter()).toHaveAttribute("aria-valuemax", "720");
  });

  it("shrinks the pane back into range when the window becomes narrower", () => {
    let measuredWidth = 1024;
    const Narrowing = () => {
      const pane = useResizablePane(limits, 600);
      return (
        <div
          ref={(element) => {
            if (element !== null) {
              element.getBoundingClientRect = () =>
                ({ left: 0, width: measuredWidth }) as DOMRect;
            }
            pane.containerRef.current = element;
          }}
        >
          <PaneSplitter label="Resize Changed Files" controls="changed-files" pane={pane.control} />
        </div>
      );
    };
    render(<Narrowing />);
    expect(splitter()).toHaveAttribute("aria-valuenow", "600");

    measuredWidth = 800;
    act(() => { window.dispatchEvent(new Event("resize")); });

    expect(splitter()).toHaveAttribute("aria-valuemax", "416");
    expect(splitter()).toHaveAttribute("aria-valuenow", "416");
  });
});
