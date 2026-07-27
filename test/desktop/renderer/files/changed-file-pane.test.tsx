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
    { path: "src/m.ts", status: "modified" as const, beforeContent: "m1", afterContent: "m2" },
  ],
  unifiedDiff: "diff",
};

describe("ChangedFilePane", () => {
  it("preserves the main-process order and names file states", () => {
    render(
      <StrictMode>
        <ChangedFilePane result={result} selectedFilePath="src/a.ts" onSelectFile={vi.fn()} />
      </StrictMode>,
    );

    const buttons = screen.getAllByRole("button", { name: /파일 보기/u });
    expect(buttons.map((button) => button.textContent)).toEqual([
      "삭제src/z.ts",
      "추가src/a.ts",
      "수정src/m.ts",
    ]);
    expect(screen.getByRole("button", { name: "현재 파일 보기: src/a.ts (추가)" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("changes the selected file with keyboard activation", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <StrictMode>
        <ChangedFilePane result={result} selectedFilePath="src/a.ts" onSelectFile={onSelectFile} />
      </StrictMode>,
    );

    const modified = screen.getByRole("button", { name: "파일 보기: src/m.ts (수정)" });
    modified.focus();
    await user.keyboard("{Enter}");
    expect(onSelectFile).toHaveBeenCalledWith("src/m.ts");
  });

  it("shows an explicit empty result", () => {
    render(
      <StrictMode>
        <ChangedFilePane result={{ ...result, files: [] }} selectedFilePath={null} onSelectFile={vi.fn()} />
      </StrictMode>,
    );
    expect(screen.getByText("변경 파일이 없습니다.")).toBeVisible();
  });
});
