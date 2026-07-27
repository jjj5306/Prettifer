// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AppController } from "../../../../src/desktop/renderer/controller/use-app-controller.js";
import { DesktopWorkspace } from "../../../../src/desktop/renderer/DesktopWorkspace.js";

const firstCommit = {
  id: "a".repeat(40),
  shortId: "a".repeat(7),
  parentIds: ["b".repeat(40)],
  title: "add desktop shell",
  authorName: "Prettifer Test",
  authoredAt: "2026-07-23T00:00:00.000Z",
  isMerge: false,
  selectable: true,
};
const baseCommit = "b".repeat(40);
const headCommit = firstCommit.id;
const commonCommit = "c".repeat(40);

function createController(withResult = false): AppController {
  const result = {
    baseCommit: commonCommit,
    selectedCommits: [firstCommit.id],
    files: [
      {
        path: "src/app.ts",
        status: "modified" as const,
        beforeContent: "before",
        afterContent: "after",
      },
    ],
    unifiedDiff: "diff",
  };
  return {
    state: {
      repository: {
        status: "ready",
        session: {
          repositorySessionId: "00000000-0000-4000-8000-000000000001",
          sessionRevision: 1,
          rootPath: "C:\\work\\repo",
          currentBranch: "feature/ui",
          branches: [
            { name: "main", commitId: baseCommit, isCurrent: false },
            { name: "feature/ui", commitId: headCommit, isCurrent: true },
          ],
        },
      },
      range: {
        status: "ready",
        range: {
          baseRef: "main",
          baseRefCommit: baseCommit,
          headRef: "feature/ui",
          headCommit,
          baseCommit: commonCommit,
          rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
        },
        commits: [firstCommit],
        nextOffset: null,
        pagination: { status: "idle" },
      },
      selectedCommitIds: withResult ? [firstCommit.id] : [],
      inspectedCommitId: null,
      composition: withResult
        ? { status: "ready", requestId: "composition-1", result }
        : { status: "idle" },
      selectedFilePath: withResult ? "src/app.ts" : null,
    },
    openRepository: vi.fn(),
    loadRange: vi.fn(),
    loadMoreCommits: vi.fn(),
    toggleCommit: vi.fn(),
    inspectCommit: vi.fn(),
    composeSelection: vi.fn(),
    cancelComposition: vi.fn(),
    selectFile: vi.fn(),
  };
}

describe("desktop workspace accessibility", () => {
  it("follows repository, branch and commit keyboard order", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Change Repository" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Working branch" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Load Commit Range" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` })).toHaveFocus();
  });

  it("provides named regions and status-independent selection labels", () => {
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.getByRole("heading", { level: 1, name: "Prettifer" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Repository and comparison range" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Commit Timeline" })).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Commit Timeline" })).getByText(
        "0 selected",
      ),
    ).toBeVisible();
  });

  it("continues keyboard order through calculation, files and accessible diff", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    const expected = [
      screen.getByRole("button", { name: "Change Repository" }),
      screen.getByRole("combobox", { name: "Base branch" }),
      screen.getByRole("combobox", { name: "Working branch" }),
      screen.getByRole("button", { name: "Load Commit Range" }),
      screen.getByRole("checkbox", { name: `Include in selected result: ${firstCommit.title}` }),
      screen.getByRole("button", { name: `Inspect commit: ${firstCommit.title}` }),
      screen.getByRole("button", { name: "Rebuild Selected Result" }),
      screen.getByRole("button", { name: "Tree View" }),
      screen.getByRole("button", { name: "List View" }),
      screen.getByRole("button", { name: "Currently viewing file: src/app.ts (Modified)" }),
      screen.getByRole("textbox", { name: "Read-only diff: src/app.ts · base and selected result" }),
    ];
    for (const element of expected) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });
});
