// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DesktopWorkspace } from "../../../../src/desktop/renderer/DesktopWorkspace.js";
import {
  createController,
  firstCommit,
  openFileCommit,
  readyFileHistory,
  reviewedPath,
} from "../workspace-harness.js";

describe("file history in the review area", () => {
  it("opens the selected file history from the changed files header", async () => {
    const user = userEvent.setup();
    const controller = createController(true);
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "File History" }));

    expect(controller.loadFileHistory).toHaveBeenCalledOnce();
  });

  it("shows the history beside the changed files instead of replacing them", () => {
    render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, { fileHistory: readyFileHistory })}
        />
      </StrictMode>,
    );

    // The list the file was picked from stays on screen, so the reader keeps the
    // context the history belongs to.
    expect(screen.getByRole("region", { name: "Changed Files" })).toBeVisible();
    expect(screen.getByRole("region", { name: "File History" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Differentia Codicis" })).toBeNull();
  });

  it("reviews a history commit in the same area and keeps the changed files", () => {
    render(
      <StrictMode>
        <DesktopWorkspace
          controller={createController(true, true, {
            fileHistory: readyFileHistory,
            fileCommit: openFileCommit,
          })}
        />
      </StrictMode>,
    );

    expect(screen.getByRole("region", { name: "Changed Files" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "File History Change" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "File History" })).toBeNull();
  });

  it("returns from a history commit to the history list, then to the result", async () => {
    const user = userEvent.setup();
    const reviewing = createController(true, true, {
      fileHistory: readyFileHistory,
      fileCommit: openFileCommit,
    });
    const { rerender } = render(
      <StrictMode><DesktopWorkspace controller={reviewing} /></StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "Back to File History" }));
    expect(reviewing.closeFileCommit).toHaveBeenCalledOnce();
    expect(reviewing.closeFileHistory).not.toHaveBeenCalled();

    const listed = createController(true, true, { fileHistory: readyFileHistory });
    rerender(<StrictMode><DesktopWorkspace controller={listed} /></StrictMode>);

    await user.click(screen.getByRole("button", { name: "Return to Selected Result" }));
    expect(listed.closeFileHistory).toHaveBeenCalledOnce();
  });

  it("leaves the history with Escape from the commit and then from the list", async () => {
    const user = userEvent.setup();
    const reviewing = createController(true, true, {
      fileHistory: readyFileHistory,
      fileCommit: openFileCommit,
    });
    const { rerender } = render(
      <StrictMode><DesktopWorkspace controller={reviewing} /></StrictMode>,
    );

    // Opening a change moves focus into the review region, which is where the
    // key has to land for the reader to step back without reaching for a button.
    screen.getByRole("region", { name: "File History Change" }).focus();
    await user.keyboard("{Escape}");
    expect(reviewing.closeFileCommit).toHaveBeenCalledOnce();

    const listed = createController(true, true, { fileHistory: readyFileHistory });
    rerender(<StrictMode><DesktopWorkspace controller={listed} /></StrictMode>);
    screen.getByRole("region", { name: "File History" }).focus();

    await user.keyboard("{Escape}");
    expect(listed.closeFileHistory).toHaveBeenCalledOnce();
  });

  it("opens a history commit from the list without touching the commit selection", async () => {
    const user = userEvent.setup();
    const controller = createController(true, true, { fileHistory: readyFileHistory });
    render(<StrictMode><DesktopWorkspace controller={controller} /></StrictMode>);

    const commits = within(screen.getByRole("region", { name: "File History" }))
      .getAllByRole("button", { name: new RegExp(firstCommit.title, "u") });
    await user.click(commits[0]!);

    expect(controller.openFileCommit).toHaveBeenCalledWith(firstCommit.id, reviewedPath);
    expect(controller.toggleCommit).not.toHaveBeenCalled();
  });
});
