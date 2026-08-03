// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AppController } from "../../../../src/desktop/renderer/controller/use-app-controller.js";
import { DesktopWorkspace } from "../../../../src/desktop/renderer/DesktopWorkspace.js";

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
const baseCommit = "b".repeat(40);
const headCommit = firstCommit.id;
const commonCommit = "c".repeat(40);

function createController(withResult = false): AppController {
  const result = {
    baseCommit: commonCommit,
    selectedCommits: [firstCommit.id],
    files: [
      {
        path: "src/app.ts",
        status: "modified" as const,
        beforeContent: "before",
        afterContent: "after",
      },
    ],
    mainlineParents: {},
    problemFiles: [],
    unifiedDiff: "diff",
  };
  return {
    state: {
      repository: {
        status: "ready",
        session: {
          repositorySessionId: "00000000-0000-4000-8000-000000000001",
          sessionRevision: 1,
          rootPath: "C:\\work\\repo",
          currentBranch: "feature/ui",
          branches: [
            { name: "main", commitId: baseCommit, isCurrent: false },
            { name: "feature/ui", commitId: headCommit, isCurrent: true },
          ],
        },
      },
      range: {
        status: "ready",
        range: {
          baseRef: "main",
          baseRefCommit: baseCommit,
          headRef: "feature/ui",
          headCommit,
          baseCommit: commonCommit,
          rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
        },
        commits: [firstCommit],
        nextOffset: null,
        pagination: { status: "idle" },
      },
      selectedCommitIds: withResult ? [firstCommit.id] : [],
      mergeParents: {},
      inspectedCommitId: null,
      composition: withResult
        ? { status: "ready", requestId: "composition-1", result }
        : { status: "idle" },
      selectedFilePath: withResult ? "src/app.ts" : null,
      symbolLookup: { status: "idle" },
      externalFile: { status: "idle" },
      reveal: null,
      navigationHistory: [],
    },
    openRepository: vi.fn(),
    loadRange: vi.fn(),
    loadMoreCommits: vi.fn(),
    toggleCommit: vi.fn(),
    inspectCommit: vi.fn(),
    chooseMainlineParent: vi.fn(),
    composeSelection: vi.fn(),
    cancelComposition: vi.fn(),
    selectFile: vi.fn(),
    lookUpSymbol: vi.fn().mockResolvedValue(undefined),
    goToHit: vi.fn(),
    dismissSymbolLookup: vi.fn(),
    goBack: vi.fn(),
  };
}

describe("desktop workspace accessibility", () => {
  it("follows repository, branch and commit keyboard order", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Repository" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Commit History" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Change Repository" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Working branch" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Load Commit Range" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` })).toHaveFocus();
  });

  it("provides named regions and status-independent selection labels", () => {
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.getByRole("heading", { level: 1, name: "Prettifer" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Repository and comparison range" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Commit History" })).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Commit History" })).getByText(
        "0 selected",
      ),
    ).toBeVisible();
  });

  it("provides an activity rail for each available review region", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    const rail = screen.getByRole("navigation", { name: "Workbench" });
    expect(within(rail).getByRole("button", { name: "Repository" })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: "Commit History" })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: "Changed Files" })).toBeDisabled();
    expect(within(rail).getByRole("button", { name: "Diff Review" })).toBeDisabled();

    const repository = within(rail).getByRole("button", { name: "Repository" });
    const timeline = within(rail).getByRole("button", { name: "Commit History" });
    expect(repository).toHaveAttribute("aria-current", "page");

    await user.click(timeline);
    expect(screen.getByRole("region", { name: "Commit History" })).toHaveFocus();
    expect(timeline).toHaveAttribute("aria-current", "page");
    expect(repository).not.toHaveAttribute("aria-current");
  });

  it("does not mark a disabled review region as current while rebuilding", async () => {
    const user = userEvent.setup();
    const ready = createController(true);
    const { rerender } = render(
      <StrictMode><DesktopWorkspace controller={ready} /></StrictMode>,
    );
    const files = screen.getByRole("button", { name: "Changed Files" });

    await user.click(files);
    expect(files).toHaveAttribute("aria-current", "page");

    rerender(
      <StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>,
    );

    expect(screen.getByRole("button", { name: "Changed Files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Changed Files" }))
      .not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Commit History" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("continues keyboard order through calculation, files and accessible diff", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    const expected = [
      screen.getByRole("button", { name: "Repository" }),
      screen.getByRole("button", { name: "Commit History" }),
      screen.getByRole("button", { name: "Changed Files" }),
      screen.getByRole("button", { name: "Diff Review" }),
      screen.getByRole("button", { name: "Change Repository" }),
      screen.getByRole("combobox", { name: "Base branch" }),
      screen.getByRole("combobox", { name: "Working branch" }),
      screen.getByRole("button", { name: "Load Commit Range" }),
      screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` }),
      screen.getByRole("button", {
        name: [
          `Inspect commit: ${firstCommit.title}`,
          firstCommit.id,
          firstCommit.authorName,
          firstCommit.authoredAt,
        ].join(" · "),
      }),
      screen.getByRole("button", { name: "Rebuild Selected Result" }),
      screen.getByRole("button", { name: "Tree View" }),
      screen.getByRole("button", { name: "List View" }),
      screen.getByRole("button", { name: "Currently viewing file: src/app.ts (Modified)" }),
      screen.getByRole("separator", { name: "Resize Changed Files" }),
      screen.getByRole("textbox", { name: "Read-only diff: src/app.ts · base and selected result" }),
    ];
    for (const element of expected) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });

  it("keeps the resized review pane width across file and view changes", async () => {
    const user = userEvent.setup();
    const controller = createController(true);
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);

    const separator = screen.getByRole("separator", { name: "Resize Changed Files" });
    separator.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(separator).toHaveAttribute("aria-valuenow", "320");

    await user.click(screen.getByRole("button", { name: "Tree View" }));
    await user.click(screen.getByRole("button", {
      name: "Currently viewing file: src/app.ts (Modified)",
    }));

    expect(screen.getByRole("separator", { name: "Resize Changed Files" }))
      .toHaveAttribute("aria-valuenow", "320");
    expect(controller.selectFile).toHaveBeenCalledWith("src/app.ts");
  });

  it("keeps the resized review pane width across a rebuilt result", async () => {
    const user = userEvent.setup();
    const ready = createController(true);
    const rebuilding: AppController = {
      ...ready,
      state: {
        ...ready.state,
        composition: {
          status: "loading",
          requestId: "composition-2",
          sessionRevision: 1,
          rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
        },
      },
    };
    const { rerender } = render(
      <StrictMode><DesktopWorkspace controller={ready} /></StrictMode>,
    );

    screen.getByRole("separator", { name: "Resize Changed Files" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("separator", { name: "Resize Changed Files" }))
      .toHaveAttribute("aria-valuenow", "304");

    rerender(<StrictMode><DesktopWorkspace controller={rebuilding} /></StrictMode>);
    expect(screen.queryByRole("separator", { name: "Resize Changed Files" })).toBeNull();

    rerender(<StrictMode><DesktopWorkspace controller={ready} /></StrictMode>);
    expect(screen.getByRole("separator", { name: "Resize Changed Files" }))
      .toHaveAttribute("aria-valuenow", "304");
  });

  it("does not offer the review pane splitter before a result exists", () => {
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.queryByRole("separator", { name: "Resize Changed Files" })).toBeNull();
  });
});
