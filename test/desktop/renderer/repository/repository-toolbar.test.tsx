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

    expect(screen.getByText("분석할 로컬 Git 저장소를 선택해 주세요.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "저장소 폴더 선택" }));
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
    expect(screen.getByText("현재 브랜치: feature/ui")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "비교 기준 브랜치" })).toHaveValue("main");
    expect(screen.getByRole("combobox", { name: "작업 브랜치" })).toHaveValue("feature/ui");
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

    await user.click(screen.getByRole("button", { name: "커밋 범위 불러오기" }));
    expect(onLoadRange).toHaveBeenCalledWith("main", "feature/ui");
    expect(screen.getByText(`공통 조상: ${commonCommit}`)).toBeVisible();
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
              message: "Git 저장소를 열 수 없습니다.",
              subject: "C:\\work\\plain",
              nextAction: "다른 Git 저장소 폴더를 선택해 주세요.",
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
      "Git 저장소를 열 수 없습니다. 다른 Git 저장소 폴더를 선택해 주세요.",
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
    expect(screen.getByRole("button", { name: "커밋 범위 불러오는 중" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "비교 기준 브랜치" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "작업 브랜치" })).toBeDisabled();

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
              message: "공통 이력을 찾을 수 없습니다.",
              nextAction: "다른 브랜치를 선택해 주세요.",
            },
          }}
          onOpenRepository={vi.fn()}
          onLoadRange={vi.fn()}
        />
      </StrictMode>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "공통 이력을 찾을 수 없습니다. 다른 브랜치를 선택해 주세요.",
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
      screen.getByRole("combobox", { name: "작업 브랜치" }),
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

    expect(screen.getByRole("combobox", { name: "작업 브랜치" }))
      .toHaveValue("feature/ui");
  });
});
