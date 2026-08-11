// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileHistoryPane } from "../../../../src/desktop/renderer/history/FileHistoryPane.js";

const older = "a".repeat(40);
const newer = "b".repeat(40);
const history = {
  status: "ready" as const,
  rangeRevision: "range-1",
  path: "src/current.ts",
  entries: [
    {
      id: newer,
      shortId: newer.slice(0, 7),
      parents: [older],
      title: "rename current file",
      authorName: "Author",
      authoredAt: "2026-08-02T00:00:00.000Z",
      status: "renamed" as const,
      previousPath: "src/old.ts",
      path: "src/current.ts",
      similarity: 92,
    },
    {
      id: older,
      shortId: older.slice(0, 7),
      parents: [],
      title: "create file",
      authorName: "Author",
      authoredAt: "2026-08-01T00:00:00.000Z",
      status: "added" as const,
      path: "src/old.ts",
    },
  ],
  nextOffset: null,
  partial: {
    reason: "shallow" as const,
    message: "Only known history is shown.",
    nextAction: "Fetch more history.",
  },
  pagination: { status: "idle" as const },
  focusedCommitId: older,
};

const result = {
  baseCommit: "c".repeat(40),
  selectedCommits: [newer],
  mainlineParents: {},
  files: [],
  problemFiles: [],
  fileContributions: [{ path: history.path, commits: [newer] }],
  unifiedDiff: "",
};

describe("FileHistoryPane", () => {
  it("shows oldest first with rename, contribution and partial labels", () => {
    render(
      <FileHistoryPane
        isCurrentRegion={false}
        history={history}
        selectedCommits={[newer]}
        result={result}
        onFocusCommit={vi.fn()}
        onOpenCommit={vi.fn()}
        onLoadMore={vi.fn()}
        onReturnToComposite={vi.fn()}
      />,
    );

    const commits = screen.getAllByRole("button");
    expect(commits[0]).toHaveAccessibleName(/create file/u);
    expect(commits[1]).toHaveAccessibleName(/rename current file/u);
    expect(commits[1]).toHaveAccessibleName(/Contributes/u);
    expect(screen.getByText("Partial history")).toBeVisible();
    expect(screen.getByText(/Renamed src\/old\.ts to src\/current\.ts/u)).toBeVisible();
  });

  it("moves with arrows, opens with Enter and returns with Escape", async () => {
    const user = userEvent.setup();
    const onFocusCommit = vi.fn();
    const onOpenCommit = vi.fn();
    const onReturnToComposite = vi.fn();
    render(
      <FileHistoryPane
        isCurrentRegion={false}
        history={history}
        selectedCommits={[newer]}
        result={result}
        onFocusCommit={onFocusCommit}
        onOpenCommit={onOpenCommit}
        onLoadMore={vi.fn()}
        onReturnToComposite={onReturnToComposite}
      />,
    );

    const create = screen.getByRole("button", { name: /create file/u });
    create.focus();
    await user.keyboard("{ArrowDown}{Enter}{Escape}");

    expect(onFocusCommit).toHaveBeenCalledWith(newer);
    expect(onOpenCommit).toHaveBeenCalledWith(newer, history.path);
    expect(onReturnToComposite).toHaveBeenCalledOnce();
  });

  it("restores the timeline scroll position after the panel is reopened", () => {
    const props = {
      isCurrentRegion: false,
      history,
      selectedCommits: [newer],
      result,
      onFocusCommit: vi.fn(),
      onOpenCommit: vi.fn(),
      onLoadMore: vi.fn(),
      onReturnToComposite: vi.fn(),
    } as const;
    const first = render(<FileHistoryPane {...props} />);
    const list = screen.getByRole("list", { name: "File commits, oldest first" });
    list.scrollTop = 75;
    first.unmount();

    render(<FileHistoryPane {...props} />);

    expect(screen.getByRole("list", { name: "File commits, oldest first" }).scrollTop).toBe(75);
  });
});
