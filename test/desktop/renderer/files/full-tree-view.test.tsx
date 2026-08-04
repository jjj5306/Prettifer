// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BaseTreeState } from "../../../../src/desktop/renderer/state/app-state.js";
import type { CompositeDiffResultDto } from "../../../../src/desktop/shared/index.js";
import { Pane } from "./changed-file-pane-harness.js";

const result: CompositeDiffResultDto = {
  baseCommit: "a".repeat(40),
  selectedCommits: ["b".repeat(40)],
  files: [
    { path: "src/app.ts", status: "modified", beforeContent: "1", afterContent: "2" },
  ],
  mainlineParents: {},
  problemFiles: [],
  unifiedDiff: "diff",
};

const ready = (
  paths: readonly string[],
  truncated = false,
): BaseTreeState => ({ status: "ready", rangeRevision: "r", paths, truncated });

const basePaths = ["README.md", "docs/guide.md", "src/app.ts", "src/util.ts"];

function renderPane(
  baseTree: BaseTreeState,
  overrides: Partial<{
    result: CompositeDiffResultDto;
    selectedFilePath: string | null;
    onSelectFile: (path: string) => void;
  }> = {},
) {
  return render(
    <StrictMode>
      <Pane
        result={overrides.result ?? result}
        selectedFilePath={overrides.selectedFilePath ?? null}
        baseTree={baseTree}
        onSelectFile={overrides.onSelectFile ?? vi.fn()}
      />
    </StrictMode>,
  );
}

const openFullTree = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Full Tree" }));
};

describe("Full Tree", () => {
  it("shows the folders that lead to a change and folds the rest", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths));

    await openFullTree(user);

    expect(screen.getByRole("button", { name: "Full Tree" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "src, contains changes" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "docs, no changes" }))
      .toHaveAttribute("aria-expanded", "false");
    // The folded folder's file is not rendered at all.
    expect(screen.queryByRole("button", { name: /docs\/guide\.md/u })).toBeNull();
  });

  it("shows a changed file with its change status and an unchanged neighbour", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths));

    await openFullTree(user);

    expect(screen.getByRole("button", {
      name: "View file: src/app.ts (Modified)",
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "View file: src/util.ts (Unchanged)",
    })).toBeInTheDocument();
  });

  it("selects an unchanged file", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    renderPane(ready(basePaths), { onSelectFile });
    await openFullTree(user);

    await user.click(screen.getByRole("button", {
      name: "View file: src/util.ts (Unchanged)",
    }));

    expect(onSelectFile).toHaveBeenCalledWith("src/util.ts");
  });

  it("opens a folded folder with the keyboard", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths));
    await openFullTree(user);

    const docs = screen.getByRole("button", { name: "docs, no changes" });
    docs.focus();
    await user.keyboard("{Enter}");

    expect(docs).toHaveAttribute("aria-expanded", "true");
    expect(docs).toHaveFocus();
    expect(screen.getByRole("button", {
      name: "View file: docs/guide.md (Unchanged)",
    })).toBeInTheDocument();
  });

  it("shows a file the comparison base does not have", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths), {
      result: {
        ...result,
        files: [
          { path: "src/new/fresh.ts", status: "added", beforeContent: null, afterContent: "x" },
        ],
      },
    });

    await openFullTree(user);

    expect(screen.getByRole("button", { name: "src/new, contains changes" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", {
      name: "View file: src/new/fresh.ts (Added)",
    })).toBeInTheDocument();
  });

  it("keeps a problem file as a problem", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths), {
      result: {
        ...result,
        files: [],
        problemFiles: [{
          path: "src/app.ts",
          code: "CONTENT_CHOICE_REQUIRED",
          commit: "c".repeat(40),
          nextAction: "Select the prerequisite commits.",
        }],
      },
    });

    await openFullTree(user);

    expect(screen.getByRole("button", {
      name: "View file: src/app.ts (Problem)",
    })).toBeInTheDocument();
  });

  it("opens the folders holding the file under review", async () => {
    const user = userEvent.setup();
    renderPane(ready(["docs/deep/note.md", "src/app.ts"]), {
      selectedFilePath: "docs/deep/note.md",
      result: { ...result, files: [] },
    });

    await openFullTree(user);

    // The single-child chain is one row, and it opens because the file is below it.
    expect(screen.getByRole("button", { name: "docs/deep, no changes" }))
      .toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", {
      name: "Currently viewing file: docs/deep/note.md (Unchanged)",
    })).toBeInTheDocument();
  });

  it("joins a deep single-child chain into one row", async () => {
    const user = userEvent.setup();
    renderPane(ready(["src/main/java/app/Main.java", "README.md"]), {
      result: { ...result, files: [] },
    });

    await openFullTree(user);

    const joined = screen.getByRole("button", { name: /^src\/main\/java\/app, / });
    expect(joined).toBeInTheDocument();
    await user.click(joined);
    expect(joined).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", {
      name: "View file: src/main/java/app/Main.java (Unchanged)",
    })).toBeInTheDocument();
  });

  it("says it is preparing the structure while the list is read", async () => {
    const user = userEvent.setup();
    renderPane({ status: "loading", requestId: "r1", rangeRevision: "r" });

    await openFullTree(user);

    expect(screen.getByText("Reading the repository file list…")).toBeInTheDocument();
  });

  it("reports a failed listing and leaves the other views usable", async () => {
    const user = userEvent.setup();
    renderPane({
      status: "error",
      rangeRevision: "r",
      diagnostic: {
        code: "BASE_TREE_LIST_FAILED",
        message: "The repository file list could not be read.",
        nextAction: "Reload the comparison range, then open Full Tree again.",
      },
    });

    await openFullTree(user);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/u);

    await user.click(screen.getByRole("button", { name: "List View" }));
    expect(screen.getByRole("button", {
      name: "View file: src/app.ts (Modified)",
    })).toBeInTheDocument();
  });

  it("says the list was cut when the repository is over the limit", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths, true));

    await openFullTree(user);

    expect(screen.getByText(/more tracked files than Full Tree shows/u))
      .toBeInTheDocument();
  });

  it("does not say the list was cut when it fits", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths));

    await openFullTree(user);

    expect(screen.queryByText(/more tracked files than Full Tree shows/u)).toBeNull();
  });

  it("shows the base structure even when the result changed nothing", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths), { result: { ...result, files: [] } });

    await openFullTree(user);

    expect(screen.getByRole("button", { name: "src, no changes" })).toBeInTheDocument();
    expect(screen.queryByText("No changed files in this result.")).toBeNull();
  });

  it("does not share folded state with Tree View", async () => {
    const user = userEvent.setup();
    renderPane(ready(basePaths));

    await user.click(screen.getByRole("button", { name: "Tree View" }));
    await user.click(screen.getByRole("button", { name: "src" }));
    expect(screen.getByRole("button", { name: "src" }))
      .toHaveAttribute("aria-expanded", "false");

    await openFullTree(user);

    expect(screen.getByRole("button", { name: "src, contains changes" }))
      .toHaveAttribute("aria-expanded", "true");
  });
});
