// @vitest-environment jsdom

import { StrictMode, useState } from "react";
import { render, screen, within } from "@testing-library/react";
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
  selectable: true,
};
/** Reachable only from a side branch, so it cannot be composed. */
const unselectableCommit = {
  ...firstCommit,
  id: "9".repeat(40),
  shortId: "9".repeat(7),
  title: "side branch only",
  authoredAt: "2026-07-23T00:03:00.000Z",
  selectable: false,
};
const secondCommit = {
  ...firstCommit,
  id: "d".repeat(40),
  shortId: "d".repeat(7),
  parentIds: [firstCommit.id],
  title: "refine desktop navigation",
  authoredAt: "2026-07-23T00:02:00.000Z",
};
const firstCommitCardName = [
  `Include in selected result: ${firstCommit.title}`,
  firstCommit.id,
  firstCommit.authorName,
  firstCommit.authoredAt,
].join(" · ");
const secondCommitCardName = [
  `Include in selected result: ${secondCommit.title}`,
  secondCommit.id,
  secondCommit.authorName,
  secondCommit.authoredAt,
].join(" · ");
const unselectableCommitCardName = [
  `Cannot include in selected result: ${unselectableCommit.title}`,
  unselectableCommit.id,
  unselectableCommit.authorName,
  unselectableCommit.authoredAt,
].join(" · ");
const mergeCommitCardName = [
  `Include in selected result: ${mergeCommit.title}`,
  mergeCommit.id,
  mergeCommit.authorName,
  mergeCommit.authoredAt,
  "Merge commit",
].join(" · ");
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
  it("names the region Commit History and displays oldest commits on the left", () => {
    render(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange({ commits: [secondCommit, firstCommit] })}
        selectedCommitIds={[]}
        inspectedCommitId={null}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={vi.fn()}
        onInspectCommit={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const history = screen.getByRole("region", { name: "Commit History" });
    const commitButtons = Array.from(
      history.querySelectorAll<HTMLButtonElement>("ol > li > button"),
    );
    expect(commitButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining(firstCommit.title),
      expect.stringContaining(secondCommit.title),
    ]);
    expect(screen.getByRole("list", {
      name: "First-parent commits, oldest first",
    })).toBeVisible();
  });

  it("shows commit metadata, a selectable merge and a 100-item page action", () => {
    render(
      <StrictMode>
        <CommitHistoryPane
          isCurrentRegion={false}
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          mergeParents={{}}
          onChooseMainlineParent={vi.fn()}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText(firstCommit.shortId)).toBeVisible();
    expect(screen.getAllByText(firstCommit.authorName)).toHaveLength(2);
    expect(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` })).toBeEnabled();
    expect(screen.getByRole("checkbox", {
      name: `Include in selected result: ${mergeCommit.title}`,
    })).toBeEnabled();
    expect(screen.getByRole("combobox", {
      name: `Mainline parent for merge commit: ${mergeCommit.title}`,
    })).toBeVisible();
    expect(screen.getByRole("button", { name: "Load 100 older commits" })).toBeVisible();
  });

  it("shows the authored month and day and keeps the full timestamp available", () => {
    render(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange({ commits: [firstCommit] })}
        selectedCommitIds={[]}
        inspectedCommitId={null}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={vi.fn()}
        onInspectCommit={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const authored = screen.getByText("07-23");
    expect(authored).toBeVisible();
    expect(authored).toHaveAttribute("datetime", firstCommit.authoredAt);
    expect(authored).toHaveAttribute("title", firstCommit.authoredAt);
  });

  it("keeps non-contiguous composition selection separate from inspection", async () => {
    const user = userEvent.setup();
    const onToggleCommit = vi.fn();
    const onInspectCommit = vi.fn();
    render(
      <StrictMode>
        <CommitHistoryPane
          isCurrentRegion={false}
          range={readyRange()}
          selectedCommitIds={[firstCommit.id]}
          inspectedCommitId={mergeCommit.id}
          mergeParents={{}}
          onChooseMainlineParent={vi.fn()}
          onToggleCommit={onToggleCommit}
          onInspectCommit={onInspectCommit}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText("1 selected")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` })).toBeChecked();
    const inspectedMerge = screen.getByRole("button", { name: mergeCommitCardName });
    expect(inspectedMerge).toHaveAttribute("aria-current", "true");
    expect(inspectedMerge).toHaveAttribute("title", mergeCommit.title);
    expect(within(inspectedMerge).getByText(mergeCommit.shortId))
      .toHaveAttribute("title", mergeCommit.id);
    expect(within(inspectedMerge).getByText(mergeCommit.authorName)).toBeVisible();
    expect(within(inspectedMerge).getByText("07-23"))
      .toHaveAttribute("title", mergeCommit.authoredAt);

    // Both controls choose the commit, but only the card also inspects it.
    await user.click(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` }));
    expect(onToggleCommit.mock.calls).toEqual([[firstCommit.id]]);
    expect(onInspectCommit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: firstCommitCardName }));
    expect(onToggleCommit.mock.calls).toEqual([[firstCommit.id], [firstCommit.id]]);
    expect(onInspectCommit.mock.calls).toEqual([[firstCommit.id]]);
  });

  /** A pane wired to real state, so a click is followed through to what is rendered. */
  const InteractiveHistory = () => {
    const [selectedCommitIds, setSelectedCommitIds] = useState<string[]>([]);
    const [inspectedCommitId, setInspectedCommitId] = useState<string | null>(null);
    return (
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange({ commits: [firstCommit, secondCommit] })}
        selectedCommitIds={selectedCommitIds}
        inspectedCommitId={inspectedCommitId}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={(commitId) => {
          setSelectedCommitIds((current) => current.includes(commitId)
            ? current.filter((selected) => selected !== commitId)
            : [...current, commitId]);
        }}
        onInspectCommit={setInspectedCommitId}
        onLoadMore={vi.fn()}
      />
    );
  };

  it("selects a commit from its card and marks it as inspected", async () => {
    const user = userEvent.setup();
    render(<InteractiveHistory />);
    const card = screen.getByRole("button", { name: firstCommitCardName });
    expect(card).toHaveAttribute("aria-pressed", "false");

    await user.click(card);

    expect(screen.getByText("1 selected")).toBeVisible();
    expect(screen.getByRole("checkbox", {
      name: `Include in selected result: ${firstCommit.title}`,
    })).toBeChecked();
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveAttribute("aria-current", "true");
  });

  it("clears the selection when the same card is used again", async () => {
    const user = userEvent.setup();
    render(<InteractiveHistory />);
    const card = screen.getByRole("button", { name: firstCommitCardName });
    await user.click(card);
    expect(screen.getByText("1 selected")).toBeVisible();

    await user.click(card);

    expect(screen.getByText("0 selected")).toBeVisible();
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("checkbox", {
      name: `Include in selected result: ${firstCommit.title}`,
    })).not.toBeChecked();
  });

  it("does not select a commit that cannot be composed, even from its card", async () => {
    const user = userEvent.setup();
    const onToggleCommit = vi.fn();
    const onInspectCommit = vi.fn();
    render(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange({ commits: [unselectableCommit] })}
        selectedCommitIds={[]}
        inspectedCommitId={null}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={onToggleCommit}
        onInspectCommit={onInspectCommit}
        onLoadMore={vi.fn()}
      />,
    );
    const card = screen.getByRole("button", { name: unselectableCommitCardName });
    // Nothing to press, matching the disabled checkbox on the same row.
    expect(card).not.toHaveAttribute("aria-pressed");

    await user.click(card);

    expect(onToggleCommit).not.toHaveBeenCalled();
    // Reading the row stays available, so the inspected mark still moves.
    expect(onInspectCommit).toHaveBeenCalledWith(unselectableCommit.id);
  });

  it("keeps the checkbox and the card in step", async () => {
    const user = userEvent.setup();
    render(<InteractiveHistory />);

    await user.click(screen.getByRole("checkbox", {
      name: `Include in selected result: ${firstCommit.title}`,
    }));
    await user.click(screen.getByRole("button", { name: secondCommitCardName }));

    expect(screen.getByText("2 selected")).toBeVisible();
    expect(screen.getByRole("button", { name: firstCommitCardName }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", {
      name: `Include in selected result: ${secondCommit.title}`,
    })).toBeChecked();
  });

  it("leaves the inspected mark alone when only the checkbox is used", async () => {
    const user = userEvent.setup();
    render(<InteractiveHistory />);
    // Only a card click moves the mark, so put it on the second commit first.
    await user.click(screen.getByRole("button", { name: secondCommitCardName }));

    await user.click(screen.getByRole("checkbox", {
      name: `Include in selected result: ${firstCommit.title}`,
    }));

    expect(screen.getByText("2 selected")).toBeVisible();
    // Still the second commit: the checkbox chooses, it does not inspect.
    expect(screen.getByRole("button", { name: secondCommitCardName }))
      .toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: firstCommitCardName }))
      .not.toHaveAttribute("aria-current");
  });

  it("reports an empty selection in the compact heading", () => {
    render(
      <StrictMode>
        <CommitHistoryPane
          isCurrentRegion={false}
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          mergeParents={{}}
          onChooseMainlineParent={vi.fn()}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={vi.fn()}
        />
      </StrictMode>,
    );
    expect(screen.getByText("0 selected")).toBeVisible();
  });

  it("explains an empty branch range", () => {
    render(
      <StrictMode>
        <CommitHistoryPane
          isCurrentRegion={false}
          range={readyRange({ commits: [], nextOffset: null })}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          mergeParents={{}}
          onChooseMainlineParent={vi.fn()}
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
          isCurrentRegion={false}
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          mergeParents={{}}
          onChooseMainlineParent={vi.fn()}
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
          isCurrentRegion={false}
          range={readyRange()}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          mergeParents={{}}
          onChooseMainlineParent={vi.fn()}
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
          isCurrentRegion={false}
          range={readyRange({ nextOffset: null })}
          selectedCommitIds={[]}
          inspectedCommitId={null}
          mergeParents={{}}
          onChooseMainlineParent={vi.fn()}
          onToggleCommit={vi.fn()}
          onInspectCommit={vi.fn()}
          onLoadMore={onLoadMore}
        />
      </StrictMode>,
    );
    // Display order is newest first, so the merge is the first selectable commit.
    expect(screen.getByRole("checkbox", {
      name: `Include in selected result: ${mergeCommit.title}`,
    })).toHaveFocus();
  });

  it("restores focus to the first commit card when no commit is selectable", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange({ commits: [unselectableCommit] })}
        selectedCommitIds={[]}
        inspectedCommitId={null}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={vi.fn()}
        onInspectCommit={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Load 100 older commits" }));

    rerender(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange({ commits: [unselectableCommit], nextOffset: null })}
        selectedCommitIds={[]}
        inspectedCommitId={null}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={vi.fn()}
        onInspectCommit={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByRole("button", { name: unselectableCommitCardName })).toHaveFocus();
  });

  it("offers a mainline parent for each parent of a merge commit", () => {
    render(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange()}
        selectedCommitIds={[]}
        inspectedCommitId={null}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={vi.fn()}
        onInspectCommit={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const picker = screen.getByRole("combobox", {
      name: `Mainline parent for merge commit: ${mergeCommit.title}`,
    });
    const options = Array.from(picker.querySelectorAll("option"))
      .map((option) => option.value)
      .filter((value) => value.length > 0);
    expect(options).toEqual(["1", "2"]);
    expect(screen.queryByRole("combobox", {
      name: `Mainline parent for merge commit: ${firstCommit.title}`,
    })).toBeNull();
  });

  it("marks a selected merge commit that still needs a mainline parent", () => {
    render(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange()}
        selectedCommitIds={[mergeCommit.id]}
        inspectedCommitId={null}
        mergeParents={{}}
        onChooseMainlineParent={vi.fn()}
        onToggleCommit={vi.fn()}
        onInspectCommit={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", {
      name: `Mainline parent for merge commit: ${mergeCommit.title}`,
    })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", {
      name: [
        `Include in selected result: ${mergeCommit.title}`,
        mergeCommit.id,
        mergeCommit.authorName,
        mergeCommit.authoredAt,
        "Merge commit needs a mainline parent",
      ].join(" · "),
    })).toBeVisible();
  });

  it("reports the chosen mainline parent and keeps other selections untouched", async () => {
    const user = userEvent.setup();
    const onChooseMainlineParent = vi.fn();
    const onToggleCommit = vi.fn();
    render(
      <CommitHistoryPane
        isCurrentRegion={false}
        range={readyRange()}
        selectedCommitIds={[mergeCommit.id]}
        inspectedCommitId={null}
        mergeParents={{ [mergeCommit.id]: 2 }}
        onChooseMainlineParent={onChooseMainlineParent}
        onToggleCommit={onToggleCommit}
        onInspectCommit={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    const picker = screen.getByRole("combobox", {
      name: `Mainline parent for merge commit: ${mergeCommit.title}`,
    });
    expect(picker).toHaveValue("2");
    expect(picker).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", {
      name: [
        `Include in selected result: ${mergeCommit.title}`,
        mergeCommit.id,
        mergeCommit.authorName,
        mergeCommit.authoredAt,
        "Merge commit using parent 2",
      ].join(" · "),
    })).toBeVisible();

    await user.selectOptions(picker, "1");
    expect(onChooseMainlineParent).toHaveBeenCalledWith(mergeCommit.id, 1);
    expect(onToggleCommit).not.toHaveBeenCalled();
    expect(screen.getByText("1 selected")).toBeVisible();
  });
});
