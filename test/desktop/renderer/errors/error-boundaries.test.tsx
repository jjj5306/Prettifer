// @vitest-environment jsdom

import { StrictMode, useState, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "../../../../src/desktop/renderer/errors/AppErrorBoundary.js";
import { DiffErrorBoundary } from "../../../../src/desktop/renderer/errors/DiffErrorBoundary.js";

const Broken = (): ReactNode => {
  throw new Error("render failed");
};

describe("renderer error boundaries", () => {
  it("shows an application recovery action for root rendering errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Recoverable = () => {
      const [broken, setBroken] = useState(true);
      return (
        <AppErrorBoundary onRecover={() => { setBroken(false); }}>
          {broken ? <Broken /> : <p>Workspace recovered</p>}
        </AppErrorBoundary>
      );
    };
    render(<StrictMode><Recoverable /></StrictMode>);

    expect(screen.getByRole("alert")).toHaveTextContent("The app could not be displayed");
    await user.click(screen.getByRole("button", { name: "Reload Workspace" }));
    expect(screen.getByText("Workspace recovered")).toBeVisible();
    vi.restoreAllMocks();
  });

  it("contains Monaco-area errors and offers a focused diff recovery", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const RecoverableDiff = () => {
      const [broken, setBroken] = useState(true);
      return (
        <section aria-label="Diff area">
          <DiffErrorBoundary onRecover={() => { setBroken(false); }}>
            {broken ? <Broken /> : <p>Diff recovered</p>}
          </DiffErrorBoundary>
        </section>
      );
    };
    render(<StrictMode><RecoverableDiff /></StrictMode>);

    expect(screen.getByRole("alert")).toHaveTextContent("The diff could not be displayed");
    await user.click(screen.getByRole("button", { name: "Reload Diff" }));
    expect(screen.getByText("Diff recovered")).toBeVisible();
    vi.restoreAllMocks();
  });
});
