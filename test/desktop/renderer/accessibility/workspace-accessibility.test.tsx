// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: "다른 저장소 선택" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "비교 기준 브랜치" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "작업 브랜치" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "커밋 범위 불러오기" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: `통합에 포함: ${firstCommit.title}` })).toHaveFocus();
  });

  it("provides named regions and status-independent selection labels", () => {
    render(<StrictMode><DesktopWorkspace controller={createController()} /></StrictMode>);

    expect(screen.getByRole("heading", { level: 1, name: "Prettifer" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "저장소와 비교 범위" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "커밋 이력" })).toBeVisible();
    expect(screen.getByText("통합 선택 0개")).toBeVisible();
  });

  it("continues keyboard order through calculation, files and accessible diff", async () => {
    const user = userEvent.setup();
    render(<StrictMode><DesktopWorkspace controller={createController(true)} /></StrictMode>);

    const expected = [
      screen.getByRole("button", { name: "다른 저장소 선택" }),
      screen.getByRole("combobox", { name: "비교 기준 브랜치" }),
      screen.getByRole("combobox", { name: "작업 브랜치" }),
      screen.getByRole("button", { name: "커밋 범위 불러오기" }),
      screen.getByRole("checkbox", { name: `통합에 포함: ${firstCommit.title}` }),
      screen.getByRole("button", { name: `커밋 자세히 보기: ${firstCommit.title}` }),
      screen.getByRole("button", { name: "통합 결과 다시 만들기" }),
      screen.getByRole("button", { name: "현재 파일 보기: src/app.ts (수정)" }),
      screen.getByRole("textbox", { name: "읽기 전용 diff: src/app.ts · 원본과 통합 결과" }),
    ];
    for (const element of expected) {
      await user.tab();
      expect(element).toHaveFocus();
    }
  });
});
