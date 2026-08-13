// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AppController } from "../../../../src/desktop/renderer/controller/use-app-controller.js";
import { DesktopWorkspace } from "../../../../src/desktop/renderer/DesktopWorkspace.js";
import surface from "../../../../src/desktop/renderer/PanelSurface.module.css";

const firstCommit = {
  id: "a".repeat(40),
  shortId: "a".repeat(7),
  parents: [{ id: "b".repeat(40), shortId: "b".repeat(7), title: null }],
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
        firstPageOffset: null,
        pagination: { status: "idle" },
      },
      selectedCommitIds: withResult ? [firstCommit.id] : [],
      mergeParents: {},
      inspectedCommitId: null,
      composition: withResult
        ? { status: "ready", requestId: "composition-1", result }
        : { status: "idle" },
      selectedFilePath: withResult ? "src/app.ts" : null,
      fileHistory: { status: "idle" },
      fileCommit: { status: "idle" },
      symbolLookup: { status: "idle" },
      groupingRules: {
        status: "ready",
        rules: [{ prefix: "src", name: "Source" }],
        saveDiagnostic: null,
      },
      baseTree: { status: "idle" },
      externalFile: { status: "idle" },
      reveal: null,
      navigationHistory: [],
    },
    openRepository: vi.fn(),
    loadRange: vi.fn(),
    loadMoreCommits: vi.fn(),
    toggleCommit: vi.fn(),
    resetLoadedCommits: vi.fn(),
    clearCommitSelection: vi.fn(),
    inspectCommit: vi.fn(),
    chooseMainlineParent: vi.fn(),
    composeSelection: vi.fn(),
    cancelComposition: vi.fn(),
    selectFile: vi.fn(),
    loadFileHistory: vi.fn().mockResolvedValue(undefined),
    loadMoreFileHistory: vi.fn().mockResolvedValue(undefined),
    openFileCommit: vi.fn().mockResolvedValue(undefined),
    closeFileCommit: vi.fn(),
    focusFileHistoryCommit: vi.fn(),
    lookUpSymbol: vi.fn().mockResolvedValue(undefined),
    goToHit: vi.fn(),
    dismissSymbolLookup: vi.fn(),
    goBack: vi.fn(),
    loadBaseTree: vi.fn().mockResolvedValue(undefined),
    saveGroupingRules: vi.fn().mockResolvedValue(undefined),
  };
}

describe("desktop workspace accessibility", () => {
  it("follows repository, branch and commit keyboard order", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Repository" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "File History" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Group Rules" })).toHaveFocus();
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

  it("provides only the workbench entries that open a distinct view", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    const rail = screen.getByRole("navigation", { name: "Workbench" });
    expect(within(rail).getByRole("button", { name: "Repository" })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: "File History" })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: "Group Rules" })).toBeEnabled();
    expect(within(rail).queryByRole("button", { name: "Commit History" })).toBeNull();
    expect(within(rail).queryByRole("button", { name: "Changed Files" })).toBeNull();
    expect(within(rail).queryByRole("button", { name: "Diff Review" })).toBeNull();

    const repository = within(rail).getByRole("button", { name: "Repository" });
    const fileHistory = within(rail).getByRole("button", { name: "File History" });
    expect(repository).toHaveAttribute("aria-current", "page");

    await user.click(fileHistory);
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "File History" })).toHaveFocus();
    });
    expect(fileHistory).toHaveAttribute("aria-current", "page");
    expect(repository).not.toHaveAttribute("aria-current");
  });

  it("keeps File History available when the selected result disappears", async () => {
    const user = userEvent.setup();
    const ready = createController(true);
    const { rerender } = render(
      <StrictMode><DesktopWorkspace controller={ready} /></StrictMode>,
    );
    const fileHistory = screen.getByRole("button", { name: "File History" });

    await user.click(fileHistory);
    expect(fileHistory).toHaveAttribute("aria-current", "page");

    rerender(
      <StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>,
    );

    expect(screen.getByRole("button", { name: "File History" }))
      .not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: "File History" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "File History" })).toBeVisible();
  });

  it("continues keyboard order through calculation, files and accessible diff", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    const expected = [
      screen.getByRole("button", { name: "Repository" }),
      screen.getByRole("button", { name: "File History" }),
      screen.getByRole("button", { name: "Group Rules" }),
      screen.getByRole("button", { name: "Change Repository" }),
      screen.getByRole("combobox", { name: "Base branch" }),
      screen.getByRole("combobox", { name: "Working branch" }),
      screen.getByRole("button", { name: "Load Commit Range" }),
      // Sits in the Commit History heading row, before the commit list.
      screen.getByRole("button", { name: "Clear selection" }),
      screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` }),
      screen.getByRole("button", {
        name: [
          `Include in selected result: ${firstCommit.title}`,
          firstCommit.id,
          firstCommit.authorName,
          firstCommit.authoredAt,
        ].join(" · "),
      }),
      screen.getByRole("button", { name: "Rebuild Selected Result" }),
      screen.getByRole("button", { name: "Tree View" }),
      screen.getByRole("button", { name: "List View" }),
      screen.getByRole("button", { name: "Config View" }),
      screen.getByRole("button", { name: "Full Tree" }),
      screen.getByRole("button", { name: "Currently viewing file: src/app.ts (Modified)" }),
      screen.getByRole("separator", { name: "Resize Changed Files" }),
      screen.getByRole("button", { name: "Side-by-side" }),
      screen.getByRole("button", { name: "Inline" }),
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
  it("opens the group rule editor from the activity rail", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "Group Rules" }));

    expect(screen.getByRole("button", { name: "Config View" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Group rules" })).toBeVisible();
    expect(screen.getByLabelText("Path prefix")).toBeVisible();
    expect(screen.getByRole("button", { name: "Group Rules" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("keeps the reviewed file visible when the rail opens the rule editor", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "Config View" }));
    // Fold the group away, then arrive again through the rail.
    await user.click(screen.getByRole("button", { name: /^Source, / }));
    await user.click(screen.getByRole("button", { name: "List View" }));
    await user.click(screen.getByRole("button", { name: "Group Rules" }));

    expect(screen.getByRole("button", { name: /^Source, / }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", {
      name: /Currently viewing file: src\/app\.ts .*rule src to Source/u,
    })).toBeVisible();
  });

  it("marks the group rule entry unavailable until a result exists", () => {
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.getByRole("button", { name: "Group Rules" }))
      .toHaveAttribute("aria-disabled", "true");
  });
  const currentRegionMarker = surface.currentRegion ?? "";

  it("marks file history when opened from the rail with a mouse", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);
    const history = screen.getByRole("region", { name: "Commit History" });

    expect(history).not.toHaveClass(currentRegionMarker);
    await user.click(screen.getByRole("button", { name: "File History" }));

    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);
    expect(screen.getByRole("region", { name: "Repository and comparison range" }))
      .not.toHaveClass(currentRegionMarker);
  });

  it("marks the same region when the rail is used from the keyboard", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    screen.getByRole("button", { name: "File History" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);
  });

  it("keeps the marker after focus moves into another region", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);
    await user.click(screen.getByRole("button", { name: "File History" }));

    await user.click(screen.getByRole("combobox", { name: "Base branch" }));

    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);
  });

  it("restores the comparison-base tree when leaving file history", async () => {
    const user = userEvent.setup();
    const controller = createController(true);
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "File History" }));
    await user.click(screen.getByRole("button", { name: "Repository" }));

    expect(controller.loadBaseTree).toHaveBeenNthCalledWith(1, "head");
    expect(controller.loadBaseTree).toHaveBeenNthCalledWith(2, "base");
  });

  it("returns to the repository view when loading a new range from file history", async () => {
    const user = userEvent.setup();
    const controller = createController(true);
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "File History" }));
    await user.click(screen.getByRole("button", { name: "Load Commit Range" }));

    expect(screen.getByRole("button", { name: "Repository" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("marks the changed file region for the group rule entry", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "Group Rules" }));

    expect(screen.getByRole("region", { name: "Changed Files" }))
      .toHaveClass(currentRegionMarker);
  });

  it("keeps file history active when the selected result goes away", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "File History" }));
    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);

    rerender(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.getByRole("button", { name: "File History" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);
  });

  it("does not add a state to the region for assistive technology", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "File History" }));

    // The rail already says where the user is; the region must not repeat it.
    const history = screen.getByRole("region", { name: "File History" });
    expect(history).not.toHaveAttribute("aria-current");
    expect(history).not.toHaveAttribute("aria-selected");
  });
});
