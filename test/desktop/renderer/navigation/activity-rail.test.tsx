// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActivityRail } from "../../../../src/desktop/renderer/navigation/ActivityRail.js";

describe("ActivityRail", () => {
  it("offers the repository and the introduction, and nothing a panel already opens", () => {
    render(
      <ActivityRail activeRegion="repository" onActivate={vi.fn()} onOpenAbout={vi.fn()} />,
    );

    const descriptions = new Map([
      ["Repository", "Choose the repository and comparison range."],
      ["About Prettifer", "What Prettifer is, and the version you are running."],
    ]);
    for (const [label, description] of descriptions) {
      const button = screen.getByRole("button", { name: label });
      const descriptionId = button.getAttribute("aria-describedby");
      expect(descriptionId).not.toBeNull();
      expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(label);
      expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(description);
    }
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(["Repository", "About Prettifer"]);
    // File history and group rules start in the panel that holds the selection.
    expect(screen.queryByRole("button", { name: "File History" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Group Rules" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Commit History" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Changed Files" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Diff Review" })).toBeNull();
    expect(screen.getAllByRole("tooltip")).toHaveLength(2);
  });

  it("keeps both entries usable with no repository and no result", () => {
    render(
      <ActivityRail activeRegion="repository" onActivate={vi.fn()} onOpenAbout={vi.fn()} />,
    );

    for (const label of ["Repository", "About Prettifer"]) {
      expect(screen.getByRole("button", { name: label }))
        .not.toHaveAttribute("aria-disabled");
    }
  });

  it("activates the repository region and focuses its panel", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <>
        <ActivityRail activeRegion="files" onActivate={onActivate} onOpenAbout={vi.fn()} />
        <section id="repository-workspace" tabIndex={-1}>Repository panel</section>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Repository" }));

    expect(onActivate).toHaveBeenCalledWith("repository");
    expect(screen.getByText("Repository panel")).toHaveFocus();
  });

  it("marks the repository entry only while that region is current", () => {
    const { rerender } = render(
      <ActivityRail activeRegion="repository" onActivate={vi.fn()} onOpenAbout={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Repository" }))
      .toHaveAttribute("aria-current", "page");

    rerender(
      <ActivityRail activeRegion="fileHistory" onActivate={vi.fn()} onOpenAbout={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Repository" }))
      .not.toHaveAttribute("aria-current");
  });

  it("opens the introduction without changing the current region", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onOpenAbout = vi.fn();
    render(
      <ActivityRail activeRegion="files" onActivate={onActivate} onOpenAbout={onOpenAbout} />,
    );

    await user.click(screen.getByRole("button", { name: "About Prettifer" }));

    expect(onOpenAbout).toHaveBeenCalledOnce();
    // The introduction sits over the workbench, so it is never a current region.
    expect(onActivate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "About Prettifer" }))
      .not.toHaveAttribute("aria-current");
  });
});
