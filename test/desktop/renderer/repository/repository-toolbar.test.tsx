// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RepositoryToolbar } from "../../../../src/desktop/renderer/repository/RepositoryToolbar.js";
import type { AppState } from "../../../../src/desktop/renderer/state/app-state.js";

const baseCommit = "b".repeat(40);
const headCommit = "a".repeat(40);
const session = {
  repositorySessionId: "00000000-0000-4000-8000-000000000001",
  sessionRevision: 1,
  rootPath: "C:\\work\\repo",
  currentBranch: "feature/ui",
  branches: [
    { name: "main", commitId: baseCommit, isCurrent: false },
    { name: "feature/ui", commitId: headCommit, isCurrent: true },
  ],
};

const baseState: AppState = {
  repository: { status: "empty" },
  range: { status: "idle" },
  selectedCommitIds: [],
  inspectedCommitId: null,
  composition: { status: "idle" },
  selectedFilePath: null,
};

describe("RepositoryToolbar", () => {
  it("offers repository selection from the initial empty state", async () => {
    const user = userEvent.setup();
    const onOpenRepository = vi.fn();
    render(
      <StrictMode>
        <RepositoryToolbar
          repository={baseState.repository}
          range={baseState.range}
          onOpenRepository={onOpenRepository}
          onLoadRange={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText("Choose a local Git repository to review.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open Repository" }));
    expect(onOpenRepository).toHaveBeenCalledOnce();
  });

  it("shows the normalized path, current branch and local branch controls", () => {
    render(
      <StrictMode>
        <RepositoryToolbar
          repository={{ status: "ready", session }}
          range={baseState.range}
          onOpenRepository={vi.fn()}
          onLoadRange={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText(session.rootPath)).toBeVisible();
    expect(screen.getByText("Current branch: feature/ui")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toHaveValue("main");
    expect(screen.getByRole("combobox", { name: "Working branch" })).toHaveValue("feature/ui");
  });

  it("loads the selected branch range and displays its common ancestor", async () => {
    const user = userEvent.setup();
    const onLoadRange = vi.fn();
    const commonCommit = "c".repeat(40);
    render(
      <StrictMode>
        <RepositoryToolbar
          repository={{ status: "ready", session }}
          range={{
            status: "ready",
            range: {
              baseRef: "main",
              baseRefCommit: baseCommit,
              headRef: "feature/ui",
              headCommit,
              baseCommit: commonCommit,
              rangeRevision: `${baseCommit}:${headCommit}:${commonCommit}`,
            },
            commits: [],
            nextOffset: null,
            pagination: { status: "idle" },
          }}
          onOpenRepository={vi.fn()}
          onLoadRange={onLoadRange}
        />
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "Load Commit Range" }));
    expect(onLoadRange).toHaveBeenCalledWith("main", "feature/ui");
    expect(screen.getByText(`Common ancestor: ${commonCommit}`)).toBeVisible();
  });

  it("keeps the previous repository visible with actionable diagnostics", () => {
    render(
      <StrictMode>
        <RepositoryToolbar
          repository={{
            status: "error",
            session,
            diagnostic: {
              code: "INVALID_REPOSITORY",
              message: "The Git repository could not be opened.",
              subject: "C:\\work\\plain",
              nextAction: "Choose another Git repository folder.",
            },
          }}
          range={baseState.range}
          onOpenRepository={vi.fn()}
          onLoadRange={vi.fn()}
        />
      </StrictMode>,
    );

    expect(screen.getByText(session.rootPath)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The Git repository could not be opened. Choose another Git repository folder.",
    );
  });

  it("names range loading and error states with a next action", () => {
    const { rerender } = render(
      <StrictMode>
        <RepositoryToolbar
          repository={{ status: "ready", session }}
          range={{
            status: "loading",
            requestId: "range-1",
            sessionRevision: 1,
            baseRef: "main",
            headRef: "feature/ui",
          }}
          onOpenRepository={vi.fn()}
          onLoadRange={vi.fn()}
        />
      </StrictMode>,
    );
    expect(screen.getByRole("button", { name: "Loading Commit Range…" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Base branch" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Working branch" })).toBeDisabled();

    rerender(
      <StrictMode>
        <RepositoryToolbar
          repository={{ status: "ready", session }}
          range={{
            status: "error",
            baseRef: "main",
            headRef: "feature/ui",
            diagnostic: {
              code: "NO_COMMON_ANCESTOR",
              message: "No common history was found.",
              nextAction: "Choose another branch range.",
            },
          }}
          onOpenRepository={vi.fn()}
          onLoadRange={vi.fn()}
        />
      </StrictMode>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No common history was found. Choose another branch range.",
    );
  });

  it("resets uncontrolled branch drafts when a different repository opens", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RepositoryToolbar
        repository={{ status: "ready", session }}
        range={baseState.range}
        onOpenRepository={vi.fn()}
        onLoadRange={vi.fn()}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Working branch" }),
      "main",
    );

    const nextSession = {
      ...session,
      repositorySessionId: "00000000-0000-4000-8000-000000000002",
      currentBranch: "feature/ui",
    };
    rerender(
      <RepositoryToolbar
        repository={{ status: "ready", session: nextSession }}
        range={baseState.range}
        onOpenRepository={vi.fn()}
        onLoadRange={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Working branch" }))
      .toHaveValue("feature/ui");
  });
});
