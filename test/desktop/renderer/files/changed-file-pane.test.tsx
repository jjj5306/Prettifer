// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChangedFilePane } from "../../../../src/desktop/renderer/files/ChangedFilePane.js";

const result = {
  baseCommit: "a".repeat(40),
  selectedCommits: ["b".repeat(40)],
  files: [
    { path: "src/z.ts", status: "deleted" as const, beforeContent: "z", afterContent: null },
    { path: "src/a.ts", status: "added" as const, beforeContent: null, afterContent: "a" },
    { path: "src/nested/m.ts", status: "modified" as const, beforeContent: "m1", afterContent: "m2" },
  ],
  unifiedDiff: "diff",
};

describe("ChangedFilePane", () => {
  it("shows the main-process order and English file states in List View", () => {
    render(
      <StrictMode>
        <ChangedFilePane result={result} selectedFilePath="src/a.ts" onSelectFile={vi.fn()} />
      </StrictMode>,
    );

    expect(screen.getByRole("button", { name: "List View" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const files = screen.getAllByRole("button", { name: /file: /iu });
    expect(files.map((button) => button.textContent)).toEqual([
      "Dsrc/z.ts",
      "Asrc/a.ts",
      "Msrc/nested/m.ts",
    ]);
    expect(screen.getByRole("button", {
      name: "Currently viewing file: src/a.ts (Added)",
    })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches between List View and Tree View without changing the selected file", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <StrictMode>
        <ChangedFilePane
          result={result}
          selectedFilePath="src/nested/m.ts"
          onSelectFile={onSelectFile}
        />
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "Tree View" }));

    expect(screen.getByRole("button", { name: "Tree View" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("src")).toBeVisible();
    expect(screen.getByText("nested")).toBeVisible();
    expect(screen.getByRole("button", {
      name: "Currently viewing file: src/nested/m.ts (Modified)",
    })).toHaveAttribute("aria-pressed", "true");
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("collapses and expands a Tree View directory without losing the selection", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <StrictMode>
        <ChangedFilePane
          result={result}
          selectedFilePath="src/nested/m.ts"
          onSelectFile={onSelectFile}
        />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "Tree View" }));

    const nested = screen.getByRole("button", { name: "nested" });
    expect(nested).toHaveAttribute("aria-expanded", "true");

    await user.click(nested);
    expect(nested).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", {
      name: "Currently viewing file: src/nested/m.ts (Modified)",
    })).toBeNull();
    expect(screen.getByRole("button", { name: "View file: src/a.ts (Added)" })).toBeVisible();

    await user.click(nested);
    expect(nested).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", {
      name: "Currently viewing file: src/nested/m.ts (Modified)",
    })).toHaveAttribute("aria-pressed", "true");
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it("collapses a Tree View directory with keyboard activation", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ChangedFilePane result={result} selectedFilePath={null} onSelectFile={vi.fn()} />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "Tree View" }));

    const root = screen.getByRole("button", { name: "src" });
    root.focus();
    await user.keyboard("{Enter}");

    expect(root).toHaveAttribute("aria-expanded", "false");
    expect(root).toHaveFocus();
    expect(screen.queryByRole("button", { name: /file: /iu })).toBeNull();
  });

  it("changes the selected file with keyboard activation", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <StrictMode>
        <ChangedFilePane result={result} selectedFilePath="src/a.ts" onSelectFile={onSelectFile} />
      </StrictMode>,
    );

    const modified = screen.getByRole("button", {
      name: "View file: src/nested/m.ts (Modified)",
    });
    modified.focus();
    await user.keyboard("{Enter}");
    expect(onSelectFile).toHaveBeenCalledWith("src/nested/m.ts");
  });

  it("activates view toggles with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ChangedFilePane result={result} selectedFilePath="src/a.ts" onSelectFile={vi.fn()} />
      </StrictMode>,
    );

    const tree = screen.getByRole("button", { name: "Tree View" });
    tree.focus();
    await user.keyboard(" ");
    expect(tree).toHaveAttribute("aria-pressed", "true");
    expect(tree).toHaveFocus();
  });

  it("shows an explicit empty result in either view", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <ChangedFilePane
          result={{ ...result, files: [] }}
          selectedFilePath={null}
          onSelectFile={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText("No changed files in this result.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tree View" }));
    expect(screen.getByText("No changed files in this result.")).toBeVisible();
  });

  it("renders markup-shaped paths as text", () => {
    const markupPath = "src/<img src=x onerror=alert(1)>.ts";
    const { container } = render(
      <ChangedFilePane
        result={{
          ...result,
          files: [{
            path: markupPath,
            status: "added",
            beforeContent: null,
            afterContent: "safe",
          }],
        }}
        selectedFilePath={markupPath}
        onSelectFile={vi.fn()}
      />,
    );

    expect(screen.getByText(markupPath)).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
  });
});
