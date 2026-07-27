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
    expect(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: `Cannot include in selected result: ${mergeCommit.title}` })).toBeDisabled();
    expect(screen.getByText("Merge commit · unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Load 100 older commits" })).toBeVisible();
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

    expect(screen.getByText("1 selected")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` })).toBeChecked();
    expect(screen.getByRole("button", { name: `Currently inspecting: ${mergeCommit.title}` })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText(mergeCommit.id)).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` }));
    await user.click(screen.getByRole("button", { name: `Inspect commit: ${firstCommit.title}` }));
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
    expect(screen.getByText("Select at least one supported commit to build a result.")).toBeVisible();
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
      "No commits are available in this range. Choose another branch range.",
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

    screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` }).focus();
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
    await user.click(screen.getByRole("button", { name: "Load 100 older commits" }));
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
    expect(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` })).toHaveFocus();
  });
});
