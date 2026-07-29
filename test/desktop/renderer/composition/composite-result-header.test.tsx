// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompositeResultHeader } from "../../../../src/desktop/renderer/composition/CompositeResultHeader.js";
import type { CompositionState } from "../../../../src/desktop/renderer/state/app-state.js";

const readyResult = {
  baseCommit: "c".repeat(40),
  selectedCommits: ["d".repeat(40)],
  files: [],
  mainlineParents: {},
  problemFiles: [],
  unifiedDiff: "",
};
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
          pendingMainlineParents={0}
          onCompose={onCompose}
          onCancel={onCancel}
          onSelectFile={vi.fn()}
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
          pendingMainlineParents={0}
          onCompose={start.onCompose}
          onCancel={start.onCancel}
          onSelectFile={vi.fn()}
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

  it("shows the actual base and application order", () => {
    renderHeader({
      status: "ready",
      requestId: "composition-1",
      result: {
        baseCommit: range.baseCommit,
        selectedCommits: ["d".repeat(40), "e".repeat(40)],
        files: [],
        mainlineParents: {},
        problemFiles: [],
        unifiedDiff: "",
      },
    }, 2);

    expect(screen.getByText("c".repeat(7))).toHaveAttribute("title", range.baseCommit);
    expect(screen.getByText("d".repeat(7))).toHaveAttribute("title", "d".repeat(40));
    expect(screen.getByText("e".repeat(7))).toHaveAttribute("title", "e".repeat(40));
    expect(screen.getByText("2 commits · matches current selection")).toBeVisible();
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

  it("marks a result with problem files as partial and jumps to the first one", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <CompositeResultHeader
        composition={{
          status: "ready",
          requestId: "composition-1",
          result: {
            ...readyResult,
            problemFiles: [
              {
                path: "src/broken.ts",
                code: "CONTENT_CHOICE_REQUIRED",
                commit: "c".repeat(40),
                nextAction: "Select the prerequisite commits, then build the result again.",
              },
            ],
          },
        }}
        range={range}
        selectedCount={1}
        pendingMainlineParents={0}
        onCompose={vi.fn()}
        onCancel={vi.fn()}
        onSelectFile={onSelectFile}
      />,
    );

    expect(screen.getByText("Partial result")).toBeVisible();
    expect(screen.getByText(
      "1 file needs a content choice and was left at the comparison base.",
    )).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Review first problem file" }));
    expect(onSelectFile).toHaveBeenCalledWith("src/broken.ts");
  });

  it("does not mark a result without problem files as partial", () => {
    render(
      <CompositeResultHeader
        composition={{
          status: "ready",
          requestId: "composition-1",
          result: readyResult,
        }}
        range={range}
        selectedCount={1}
        pendingMainlineParents={0}
        onCompose={vi.fn()}
        onCancel={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.queryByText("Partial result")).toBeNull();
    expect(screen.queryByRole("button", { name: "Review first problem file" })).toBeNull();
  });
});
