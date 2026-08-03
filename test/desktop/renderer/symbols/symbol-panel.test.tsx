// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SymbolPanel } from "../../../../src/desktop/renderer/symbols/SymbolPanel.js";
import type { SymbolLookupState } from "../../../../src/desktop/renderer/state/app-state.js";

const hits = [
  {
    path: "src/UtVar.java",
    line: 12,
    text: "public class UtVar {",
    isDeclaration: true,
  },
  {
    path: "src/Caller.java",
    line: 30,
    text: "    new UtVar();",
    isDeclaration: false,
  },
];

function renderPanel(
  lookup: SymbolLookupState,
  overrides: {
    canGoBack?: boolean;
    onGoToHit?: (path: string, line: number) => void;
    onDismiss?: () => void;
    onGoBack?: () => void;
  } = {},
) {
  const handlers = {
    onGoToHit: overrides.onGoToHit ?? vi.fn(),
    onDismiss: overrides.onDismiss ?? vi.fn(),
    onGoBack: overrides.onGoBack ?? vi.fn(),
  };
  render(
    <StrictMode>
      <SymbolPanel
        lookup={lookup}
        canGoBack={overrides.canGoBack ?? false}
        onGoToHit={handlers.onGoToHit}
        onDismiss={handlers.onDismiss}
        onGoBack={handlers.onGoBack}
      />
    </StrictMode>,
  );
  return handlers;
}

describe("SymbolPanel", () => {
  it("shows nothing while there is no lookup and nowhere to go back to", () => {
    renderPanel({ status: "idle" });

    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers the way back even with no lookup open", async () => {
    const user = userEvent.setup();
    const handlers = renderPanel({ status: "idle" }, { canGoBack: true });

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(handlers.onGoBack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("names the symbol it is searching for", () => {
    renderPanel({ status: "loading", symbol: "UtVar", mode: "references" });

    expect(screen.getByText("Searching the repository for UtVar…")).toBeVisible();
  });

  it("lists declarations and references, marking which is which", () => {
    renderPanel({
      status: "ready",
      symbol: "UtVar",
      mode: "references",
      hits,
      truncated: false,
    });

    expect(screen.getByRole("heading", { name: "References to UtVar" })).toBeVisible();
    const entries = within(screen.getByRole("list", { name: "Symbol matches" }))
      .getAllByRole("button");
    expect(entries[0]).toHaveTextContent("def");
    expect(entries[0]).toHaveTextContent("src/UtVar.java:12");
    expect(entries[0]).toHaveTextContent("public class UtVar {");
    expect(entries[1]).toHaveTextContent("ref");
    expect(entries[1]).toHaveTextContent("src/Caller.java:30");
  });

  it("names a declaration list by what it lists", () => {
    renderPanel({
      status: "ready",
      symbol: "UtVar",
      mode: "definition",
      hits: [hits[0]!, { ...hits[0]!, path: "src/other/UtVar.java" }],
      truncated: false,
    });

    expect(screen.getByRole("heading", { name: "Declarations of UtVar" })).toBeVisible();
  });

  it("moves to a hit when it is chosen", async () => {
    const user = userEvent.setup();
    const handlers = renderPanel({
      status: "ready",
      symbol: "UtVar",
      mode: "references",
      hits,
      truncated: false,
    });

    await user.click(screen.getByRole("button", { name: /src\/Caller\.java:30/u }));

    expect(handlers.onGoToHit).toHaveBeenCalledWith("src/Caller.java", 30);
  });

  it("puts focus on the first hit so the keyboard continues in the list", () => {
    renderPanel({
      status: "ready",
      symbol: "UtVar",
      mode: "references",
      hits,
      truncated: false,
    });

    expect(within(screen.getByRole("list", { name: "Symbol matches" }))
      .getAllByRole("button")[0]).toHaveFocus();
  });

  it("closes on Escape from a hit and from the close button", async () => {
    const user = userEvent.setup();
    const handlers = renderPanel({
      status: "ready",
      symbol: "UtVar",
      mode: "references",
      hits,
      truncated: false,
    });

    await user.keyboard("{Escape}");
    expect(handlers.onDismiss).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(handlers.onDismiss).toHaveBeenCalledTimes(2);
  });

  it("says the list was cut instead of showing a silent prefix", () => {
    renderPanel({
      status: "ready",
      symbol: "get",
      mode: "references",
      hits,
      truncated: true,
    });

    expect(screen.getByText(/Showing the first 2 matches/u)).toBeVisible();
  });

  it("distinguishes no declaration from no reference", () => {
    const { unmount } = render(
      <SymbolPanel
        lookup={{ status: "empty", symbol: "UtVar", mode: "definition" }}
        canGoBack={false}
        onGoToHit={vi.fn()}
        onDismiss={vi.fn()}
        onGoBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/No declaration of UtVar/u)).toBeVisible();
    unmount();

    renderPanel({ status: "empty", symbol: "UtVar", mode: "references" });
    expect(screen.getByText(/No reference to UtVar/u)).toBeVisible();
  });

  it("says which file types the search understands", () => {
    renderPanel({ status: "unsupported", path: "docs/notes.md" });

    expect(screen.getByText(/Java, C\/C\+\+, TypeScript and JavaScript/u)).toBeVisible();
  });

  it("shows a failed search with what to do about it", () => {
    renderPanel({
      status: "error",
      symbol: "UtVar",
      diagnostic: {
        code: "SYMBOL_SEARCH_FAILED",
        message: "The repository could not be searched for that symbol.",
        nextAction: "Build the result again, then retry the search.",
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The repository could not be searched for that symbol.",
    );
    expect(screen.getByText("Build the result again, then retry the search.")).toBeVisible();
  });
});
