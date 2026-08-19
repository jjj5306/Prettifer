// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AppController } from "../../../../src/desktop/renderer/controller/use-app-controller.js";
import { DesktopWorkspace } from "../../../../src/desktop/renderer/DesktopWorkspace.js";
import surface from "../../../../src/desktop/renderer/PanelSurface.module.css";

import {
  baseCommit,
  commonCommit,
  createController,
  firstCommit,
  headCommit,
  readyFileHistory,
} from "../workspace-harness.js";

describe("desktop workspace accessibility", () => {
  it("follows repository, branch and commit keyboard order", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Repository" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "About Prettifer" })).toHaveFocus();
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

  it("keeps the rail to entries no panel already offers", () => {
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    const rail = screen.getByRole("navigation", { name: "Workbench" });
    expect(within(rail).getByRole("button", { name: "Repository" }))
      .toHaveAttribute("aria-current", "page");
    expect(within(rail).getByRole("button", { name: "About Prettifer" })).toBeEnabled();
    for (const label of ["File History", "Group Rules", "Commit History", "Changed Files", "Diff Review"]) {
      expect(within(rail).queryByRole("button", { name: label })).toBeNull();
    }
    // File history moved to the header of the panel the file is picked in.
    expect(within(screen.getByRole("region", { name: "Changed Files" }))
      .getByRole("button", { name: "File History" })).toBeEnabled();
  });

  it("opens the file history of the selected file and marks that region", async () => {
    const user = userEvent.setup();
    const controller = createController(true);
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);
    const repository = screen.getByRole("button", { name: "Repository" });

    await user.click(screen.getByRole("button", { name: "File History" }));

    expect(controller.loadFileHistory).toHaveBeenCalledOnce();
    expect(repository).not.toHaveAttribute("aria-current");
  });

  it("keeps the file history control unusable while no file is selected", () => {
    render(<StrictMode><DesktopWorkspace controller={createController(true, false)} /></StrictMode>);

    expect(screen.getByRole("button", { name: /file history/iu }))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("continues keyboard order through calculation, files and accessible diff", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    const expected = [
      screen.getByRole("button", { name: "Repository" }),
      screen.getByRole("button", { name: "About Prettifer" }),
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
      screen.getByRole("button", { name: "File History" }),
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
    expect(separator).toHaveAttribute("aria-valuenow", "352");

    await user.click(screen.getByRole("button", { name: "Tree View" }));
    await user.click(screen.getByRole("button", {
      name: "Currently viewing file: src/app.ts (Modified)",
    }));

    expect(screen.getByRole("separator", { name: "Resize Changed Files" }))
      .toHaveAttribute("aria-valuenow", "352");
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
      .toHaveAttribute("aria-valuenow", "336");

    rerender(<StrictMode><DesktopWorkspace controller={rebuilding} /></StrictMode>);
    expect(screen.queryByRole("separator", { name: "Resize Changed Files" })).toBeNull();

    rerender(<StrictMode><DesktopWorkspace controller={ready} /></StrictMode>);
    expect(screen.getByRole("separator", { name: "Resize Changed Files" }))
      .toHaveAttribute("aria-valuenow", "336");
  });

  it("does not offer the review pane splitter before a result exists", () => {
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.queryByRole("separator", { name: "Resize Changed Files" })).toBeNull();
  });

  it("opens the introduction from the rail and leaves the review untouched", async () => {
    const user = userEvent.setup();
    const controller = createController(true);
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "About Prettifer" }));

    expect(screen.getByRole("dialog", { name: "About Prettifer" })).toBeVisible();
    expect(controller.loadAppInfo).toHaveBeenCalledOnce();
    expect(controller.selectFile).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Changed Files" })).toBeVisible();
  });

  it("shows the version the workbench read", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, {
            appInfo: { status: "ready", version: "0.5.0" },
          })}
        />
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "About Prettifer" }));

    expect(within(screen.getByRole("dialog", { name: "About Prettifer" }))
      .getByText("0.5.0")).toBeVisible();
  });

  it("opens the group rule editor from Config View", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "Config View" }));
    await user.click(screen.getByRole("button", { name: "Edit group rules" }));

    expect(screen.getByRole("region", { name: "Group rules" })).toBeVisible();
    expect(screen.getByLabelText("Path prefix")).toBeVisible();
    expect(screen.getByRole("button", { name: "Config View" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  const currentRegionMarker = surface.currentRegion ?? "";

  it("marks the file history region while it holds the review area", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, { fileHistory: readyFileHistory })}
        />
      </StrictMode>,
    );
    expect(screen.getByRole("region", { name: "Commit History" }))
      .not.toHaveClass(currentRegionMarker);

    await user.click(screen.getByRole("button", { name: "File History" }));

    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);
    expect(screen.getByRole("region", { name: "Repository and comparison range" }))
      .not.toHaveClass(currentRegionMarker);
  });

  it("marks the same region when the history is opened from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, { fileHistory: readyFileHistory })}
        />
      </StrictMode>,
    );

    screen.getByRole("button", { name: "File History" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);
  });

  it("keeps the marker after focus moves into another region", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, { fileHistory: readyFileHistory })}
        />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "File History" }));

    await user.click(screen.getByRole("combobox", { name: "Base branch" }));

    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);
  });

  it("loads the selected changed file history without replacing the base tree", async () => {
    const user = userEvent.setup();
    const controller = createController(true);
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "File History" }));

    expect(controller.loadFileHistory).toHaveBeenCalledOnce();
    expect(controller.loadBaseTree).not.toHaveBeenCalled();
  });

  it("returns the marker to commit history when the selected result goes away", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, { fileHistory: readyFileHistory })}
        />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "File History" }));
    expect(screen.getByRole("region", { name: "File History" }))
      .toHaveClass(currentRegionMarker);

    rerender(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.getByRole("region", { name: "Commit History" }))
      .toHaveClass(currentRegionMarker);
  });

  it("does not add a state to the region for assistive technology", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, { fileHistory: readyFileHistory })}
        />
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "File History" }));

    // The marker class already says where the user is; the region must not repeat it.
    const history = screen.getByRole("region", { name: "File History" });
    expect(history).not.toHaveAttribute("aria-current");
    expect(history).not.toHaveAttribute("aria-selected");
  });
});
