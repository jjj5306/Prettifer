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

    expect(screen.getByRole("button", { name: "통합 결과 만들기" })).toBeDisabled();
    expect(screen.getByText("하나 이상의 합성 가능 커밋을 선택해 주세요.")).toBeVisible();
  });

  it("starts one calculation and replaces the action with cancellation", async () => {
    const user = userEvent.setup();
    const start = renderHeader({ status: "idle" }, 2);
    await user.click(screen.getByRole("button", { name: "통합 결과 만들기" }));
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

    expect(screen.queryByRole("button", { name: "통합 결과 만들기" })).not.toBeInTheDocument();
    expect(screen.getByText("통합 결과를 계산하는 중입니다.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await user.click(screen.getByRole("button", { name: "계산 취소" }));
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

    expect(screen.getByText(`실제 비교 기준: ${range.baseCommit}`)).toBeVisible();
    expect(screen.getByText(`적용 순서: ${"d".repeat(40)} → ${"e".repeat(40)}`)).toBeVisible();
    expect(screen.getByText("포함 커밋 2개 · 현재 선택과 일치")).toBeVisible();
    expect(screen.getByText("사용자 작업 트리 보존 확인")).toBeVisible();
    expect(screen.getByText("계산은 성공했으며 변경 파일이 없습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: "통합 결과 다시 만들기" })).toBeEnabled();
  });

  it("announces a cancelled calculation and keeps the retry action", () => {
    renderHeader({ status: "cancelled", requestId: "composition-1" }, 1);

    expect(screen.getByText("계산을 취소했습니다. 선택한 커밋으로 다시 계산할 수 있습니다."))
      .toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "통합 결과 다시 만들기" })).toBeEnabled();
  });

  it("announces calculation errors and provides retry", () => {
    renderHeader({
      status: "error",
      requestId: "composition-1",
      diagnostic: {
        code: "COMPOSITION_FAILED",
        message: "선택 커밋을 적용할 수 없습니다.",
        subject: "d".repeat(40),
        nextAction: "선택을 확인한 뒤 다시 계산해 주세요.",
      },
    }, 1);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "선택 커밋을 적용할 수 없습니다. 선택을 확인한 뒤 다시 계산해 주세요.",
    );
    expect(screen.getByRole("button", { name: "통합 결과 다시 만들기" })).toBeEnabled();
  });
});
