// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommitHistoryPane } from "../../../../src/desktop/renderer/history/CommitHistoryPane.js";
import type { RangeState } from "../../../../src/desktop/renderer/state/app-state.js";

const firstCommit = {
  id: "a".repeat(40),
  shortId: "a".repeat(7),
  parentIds: ["b".repeat(40)],
  title: "add desktop shell",
  authorName: "Prettifer Test",
  authoredAt: "2026-07-23T00:00:00.000Z",
  isMerge: false,
  selectable: true,
};
const mergeCommit = {
  id: "c".repeat(40),
  shortId: "c".repeat(7),
  parentIds: ["d".repeat(40), "e".repeat(40)],
  title: "merge feature branch",
  authorName: "Prettifer Test",
  authoredAt: "2026-07-23T00:01:00.000Z",
  isMerge: true,
  selectable: false,
};
const range = {
  baseRef: "main",
  baseRefCommit: "f".repeat(40),
  headRef: "feature/ui",
  headCommit: firstCommit.id,
  baseCommit: "b".repeat(40),
  rangeRevision: `${"f".repeat(40)}:${firstCommit.id}:${"b".repeat(40)}`,
};

function readyRange(overrides: Partial<Extract<RangeState, { status: "ready" }>> = {}): RangeState {
  return {
    status: "ready",
    range,
    commits: [firstCommit, mergeCommit],
    nextOffset: 100,
    pagination: { status: "idle" },
    ...overrides,
  };
}

describe("CommitHistoryPane", () => {
  it("shows commit metadata, merge restrictions and a 100-item page action", () => {
    render(
      <StrictMode>
        <CommitHistoryPane
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText(firstCommit.shortId)).toBeVisible();
    expect(screen.getAllByText(firstCommit.authorName)).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: `통합에 포함: ${firstCommit.title}` })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: `통합에 포함할 수 없음: ${mergeCommit.title}` })).toBeDisabled();
    expect(screen.getByText("병합 커밋 · 선택할 수 없음")).toBeVisible();
    expect(screen.getByRole("button", { name: "이전 커밋 100개 더 불러오기" })).toBeVisible();
  });

  it("keeps non-contiguous composition selection separate from inspection", async () => {
    const user = userEvent.setup();
    const onToggleCommit = vi.fn();
    const onInspectCommit = vi.fn();
    render(
      <StrictMode>
        <CommitHistoryPane
          range={readyRange()}
          selectedCommitIds={[firstCommit.id]}
          inspectedCommitId={mergeCommit.id}
          onToggleCommit={onToggleCommit}
          onInspectCommit={onInspectCommit}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText("통합 선택 1개")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: `통합에 포함: ${firstCommit.title}` })).toBeChecked();
    expect(screen.getByRole("button", { name: `현재 탐색: ${mergeCommit.title}` })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText(mergeCommit.id)).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: `통합에 포함: ${firstCommit.title}` }));
    await user.click(screen.getByRole("button", { name: `커밋 자세히 보기: ${firstCommit.title}` }));
    expect(onToggleCommit).toHaveBeenCalledWith(firstCommit.id);
    expect(onInspectCommit).toHaveBeenCalledWith(firstCommit.id);
  });

  it("explains an empty selection", () => {
    render(
      <StrictMode>
        <CommitHistoryPane
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );
    expect(screen.getByText("통합 결과를 만들려면 하나 이상의 커밋을 선택해 주세요.")).toBeVisible();
  });

  it("explains an empty branch range", () => {
    render(
      <StrictMode>
        <CommitHistoryPane
          range={readyRange({ commits: [], nextOffset: null })}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText(
      "선택한 브랜치 범위에 표시할 커밋이 없습니다. 다른 브랜치 범위를 선택해 주세요.",
    )).toBeVisible();
  });

  it("toggles a commit with the keyboard", async () => {
    const user = userEvent.setup();
    const onToggleCommit = vi.fn();
    render(
      <StrictMode>
        <CommitHistoryPane
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          onToggleCommit={onToggleCommit}
          onInspectCommit={vi.fn()}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );

    screen.getByRole("checkbox", { name: `통합에 포함: ${firstCommit.title}` }).focus();
    await user.keyboard("[Space]");

    expect(onToggleCommit).toHaveBeenCalledWith(firstCommit.id);
  });

  it("restores focus after the final commit page removes the load button", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <CommitHistoryPane
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={onLoadMore}
        />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "이전 커밋 100개 더 불러오기" }));
    expect(onLoadMore).toHaveBeenCalledOnce();

    rerender(
      <StrictMode>
        <CommitHistoryPane
          range={readyRange({ nextOffset: null })}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={onLoadMore}
        />
      </StrictMode>,
    );
    expect(screen.getByRole("checkbox", { name: `통합에 포함: ${firstCommit.title}` })).toHaveFocus();
  });
});
