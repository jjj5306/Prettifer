// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AboutPrettifer } from "../../../../src/desktop/renderer/about/AboutPrettifer.js";
import type { AppInfoState } from "../../../../src/desktop/renderer/state/app-state.js";

const readyInfo: AppInfoState = { status: "ready", version: "0.5.0" };

function renderAbout(appInfo: AppInfoState, onClose = vi.fn()) {
  render(
    <StrictMode>
      <AboutPrettifer isOpen appInfo={appInfo} onClose={onClose} />
    </StrictMode>,
  );
  return { onClose, dialog: screen.getByRole("dialog", { name: "About Prettifer" }) };
}

describe("AboutPrettifer", () => {
  it("says what Prettifer is, which version runs and where it comes from", () => {
    const { dialog } = renderAbout(readyInfo);

    expect(within(dialog).getByText("0.5.0")).toBeVisible();
    expect(within(dialog).getByText("https://github.com/jjj5306/Prettifer")).toBeVisible();
    expect(within(dialog).getByText(/one diff/u)).toBeVisible();
  });

  it("keeps the rest of the screen when the version cannot be read", () => {
    const { dialog } = renderAbout({
      status: "error",
      diagnostic: {
        code: "app-info-unavailable",
        message: "The application version could not be read.",
        nextAction: "Restart Prettifer.",
      },
    });

    expect(within(dialog).getByText("Not available")).toBeVisible();
    expect(within(dialog).getByText("https://github.com/jjj5306/Prettifer")).toBeVisible();
  });

  it("answers Escape through the state instead of letting the element close first", () => {
    const { onClose, dialog } = renderAbout(readyInfo);

    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);

    // The element reports its own close in a later task, which would leave the
    // state open and swallow the next request to open the screen.
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports a close the element started anyway", () => {
    const { onClose, dialog } = renderAbout(readyInfo);

    // Escape is the browser's, and it ends in the same event as the control.
    (dialog as HTMLDialogElement).close();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from its own control", async () => {
    const user = userEvent.setup();
    const { onClose, dialog } = renderAbout(readyInfo);

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows nothing until it is opened", () => {
    render(
      <StrictMode>
        <AboutPrettifer isOpen={false} appInfo={readyInfo} onClose={vi.fn()} />
      </StrictMode>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
