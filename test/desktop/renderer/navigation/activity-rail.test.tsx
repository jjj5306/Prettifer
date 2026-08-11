// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActivityRail } from "../../../../src/desktop/renderer/navigation/ActivityRail.js";

describe("ActivityRail file history", () => {
  it("enables File History only after a result file is selected", () => {
    const { rerender } = render(
      <ActivityRail
        activeRegion="files"
        resultAvailable
        fileSelected={false}
        onActivate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "File History" })).toBeDisabled();

    rerender(
      <ActivityRail
        activeRegion="fileHistory"
        resultAvailable
        fileSelected
        onActivate={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "File History" })).toBeEnabled();
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
