// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompositeResultHeader } from "../../../../src/desktop/renderer/composition/CompositeResultHeader.js";
import type { CompositionState } from "../../../../src/desktop/renderer/state/app-state.js";

const range = {
  baseRef: "main",
  baseRefCommit: "a".repeat(40),
  headRef: "feature/ui",
  headCommit: "b".repeat(40),
  baseCommit: "c".repeat(40),
  rangeRevision: `${"a".repeat(40)}:${"b".repeat(40)}:${"c".repeat(40)}`,
};

function renderHeader(
  composition: CompositionState,
  selectedCount: number,
  onCompose = vi.fn(),
  onCancel = vi.fn(),
) {
  return {
    onCompose,
    onCancel,
    ...render(
      <StrictMode>
        <CompositeResultHeader
          composition={composition}
          range={range}
          selectedCount={selectedCount}
          onCompose={onCompose}
          onCancel={onCancel}
        />
      </StrictMode>,
    ),
  };
}

describe("CompositeResultHeader", () => {
  it("requires a commit selection before calculation", () => {
    renderHeader({ status: "idle" }, 0);

    expect(screen.getByRole("button", { name: "Build Selected Result" })).toBeDisabled();
    expect(screen.getByText("Select at least one supported commit.")).toBeVisible();
  });

  it("starts one calculation and replaces the action with cancellation", async () => {
    const user = userEvent.setup();
    const start = renderHeader({ status: "idle" }, 2);
    await user.click(screen.getByRole("button", { name: "Build Selected Result" }));
    expect(start.onCompose).toHaveBeenCalledOnce();
    start.rerender(
      <StrictMode>
        <CompositeResultHeader
          composition={{
            status: "loading",
            requestId: "composition-1",
            sessionRevision: 1,
            rangeRevision: range.rangeRevision,
          }}
          range={range}
          selectedCount={2}
          onCompose={start.onCompose}
          onCancel={start.onCancel}
        />
      </StrictMode>,
    );

    expect(screen.queryByRole("button", { name: "Build Selected Result" })).not.toBeInTheDocument();
    expect(screen.getByText("Building selected result…")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(start.onCancel).toHaveBeenCalledOnce();
  });

  it("shows the actual base, application order and unchanged working tree", () => {
    renderHeader({
      status: "ready",
      requestId: "composition-1",
      result: {
        baseCommit: range.baseCommit,
        selectedCommits: ["d".repeat(40), "e".repeat(40)],
        files: [],
        unifiedDiff: "",
      },
    }, 2);

    expect(screen.getByText(range.baseCommit)).toBeVisible();
    expect(screen.getByText(`${"d".repeat(40)} → ${"e".repeat(40)}`)).toBeVisible();
    expect(screen.getByText("2 commits · matches current selection")).toBeVisible();
    expect(screen.getByText("Working tree preserved")).toBeVisible();
    expect(screen.getByText("Result built successfully with no changed files.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Rebuild Selected Result" })).toBeEnabled();
  });

  it("announces a cancelled calculation and keeps the retry action", () => {
    renderHeader({ status: "cancelled", requestId: "composition-1" }, 1);

    expect(screen.getByText("Calculation cancelled. You can rebuild with the current selection."))
      .toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Rebuild Selected Result" })).toBeEnabled();
  });

  it("announces calculation errors and provides retry", () => {
    renderHeader({
      status: "error",
      requestId: "composition-1",
      diagnostic: {
        code: "COMPOSITION_FAILED",
        message: "The selected commit could not be applied.",
        subject: "d".repeat(40),
        nextAction: "Check the selection and rebuild the result.",
      },
    }, 1);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The selected commit could not be applied. Check the selection and rebuild the result.",
    );
    expect(screen.getByRole("button", { name: "Rebuild Selected Result" })).toBeEnabled();
  });
});
