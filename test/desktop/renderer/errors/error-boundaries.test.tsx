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
          {broken ? <Broken /> : <p>앱 화면 복구 완료</p>}
        </AppErrorBoundary>
      );
    };
    render(<StrictMode><Recoverable /></StrictMode>);

    expect(screen.getByRole("alert")).toHaveTextContent("앱 화면을 표시할 수 없습니다");
    await user.click(screen.getByRole("button", { name: "앱 화면 다시 열기" }));
    expect(screen.getByText("앱 화면 복구 완료")).toBeVisible();
    vi.restoreAllMocks();
  });

  it("contains Monaco-area errors and offers a focused diff recovery", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const RecoverableDiff = () => {
      const [broken, setBroken] = useState(true);
      return (
        <section aria-label="diff 영역">
          <DiffErrorBoundary onRecover={() => { setBroken(false); }}>
            {broken ? <Broken /> : <p>diff 복구 완료</p>}
          </DiffErrorBoundary>
        </section>
      );
    };
    render(<StrictMode><RecoverableDiff /></StrictMode>);

    expect(screen.getByRole("alert")).toHaveTextContent("diff를 표시할 수 없습니다");
    await user.click(screen.getByRole("button", { name: "diff 다시 열기" }));
    expect(screen.getByText("diff 복구 완료")).toBeVisible();
    vi.restoreAllMocks();
  });
});
