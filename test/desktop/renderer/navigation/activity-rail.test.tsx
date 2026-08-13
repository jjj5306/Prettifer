// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActivityRail } from "../../../../src/desktop/renderer/navigation/ActivityRail.js";

describe("ActivityRail", () => {
  it("describes what every workbench entry opens", () => {
    render(
      <ActivityRail
        activeRegion="repository"
        resultAvailable
        fileSelected
        onActivate={vi.fn()}
      />,
    );

    const descriptions = new Map([
      ["Repository", "Choose the repository and comparison range."],
      ["File History", "Review the selected changed file's commit history."],
      ["Group Rules", "Edit the rules used to group changed files."],
    ]);

    for (const [label, description] of descriptions) {
      const button = screen.getByRole("button", { name: label });
      const descriptionId = button.getAttribute("aria-describedby");
      expect(descriptionId).not.toBeNull();
      expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(label);
      expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(description);
    }
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")))
      .toEqual(["Repository", "File History", "Group Rules"]);
    expect(screen.queryByRole("button", { name: "Commit History" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Changed Files" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Diff Review" })).toBeNull();
    expect(screen.getAllByRole("tooltip")).toHaveLength(3);
  });

  it("explains and blocks entries whose prerequisites are missing", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <ActivityRail
        activeRegion="history"
        resultAvailable={false}
        fileSelected={false}
        onActivate={onActivate}
      />,
    );

    const fileHistory = screen.getByRole("button", { name: "File History" });
    expect(fileHistory).toHaveAttribute("aria-disabled", "true");
    expect(fileHistory).not.toBeDisabled();
    const descriptionId = fileHistory.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(
      "Build a selected result to browse file history.",
    );

    await user.click(fileHistory);

    expect(onActivate).not.toHaveBeenCalled();
    expect(fileHistory).toHaveFocus();
  });

  it("enables File History only after a result and changed file are selected", () => {
    const { rerender } = render(
      <ActivityRail
        activeRegion="history"
        resultAvailable={false}
        fileSelected={false}
        onActivate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "File History" }))
      .toHaveAttribute("aria-disabled", "true");

    rerender(
      <ActivityRail
        activeRegion="fileHistory"
        resultAvailable
        fileSelected={false}
        onActivate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "File History" }))
      .toHaveAttribute("aria-disabled", "true");
    const descriptionId = screen.getByRole("button", { name: "File History" })
      .getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId ?? "")).toHaveTextContent(
      "Select a changed file to browse its history.",
    );

    rerender(
      <ActivityRail
        activeRegion="fileHistory"
        resultAvailable
        fileSelected
        onActivate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "File History" }))
      .not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: "File History" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("activates File History and focuses its panel", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <>
        <ActivityRail
          activeRegion="files"
          resultAvailable
          fileSelected
          onActivate={onActivate}
        />
        <section id="file-history" tabIndex={-1}>History panel</section>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "File History" }));

    expect(onActivate).toHaveBeenCalledWith("fileHistory");
    expect(screen.getByText("History panel")).toHaveFocus();
  });
});
