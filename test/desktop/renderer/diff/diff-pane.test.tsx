// @vitest-environment jsdom

import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DiffPane } from "../../../../src/desktop/renderer/diff/DiffPane.js";

const identity = {
  repositorySessionId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
};
const file = {
  path: "src/app.ts",
  status: "modified" as const,
  beforeContent: "before",
  afterContent: "after",
};

describe("DiffPane", () => {
  it("loads Monaco only after a result file is selected", async () => {
    const adapter = { show: vi.fn(), dispose: vi.fn() };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const { rerender } = render(
      <StrictMode>
        <DiffPane identity={identity} file={null} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    expect(loadAdapter).not.toHaveBeenCalled();
    expect(screen.getByText("표시할 변경 파일을 선택해 주세요.")).toBeVisible();

    rerender(
      <StrictMode>
        <DiffPane identity={identity} file={file} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    expect(screen.getByText("diff 편집기를 불러오는 중입니다.")).toBeVisible();
    await waitFor(() => {
      expect(adapter.show).toHaveBeenCalledWith(expect.any(HTMLElement), identity, file);
    });
    expect(screen.getByRole("textbox", {
      name: "읽기 전용 diff: src/app.ts · 원본과 통합 결과",
    })).toBeVisible();
    expect(screen.getByText("왼쪽 원본 · 오른쪽 통합 결과")).toBeVisible();
  });

  it("disposes Monaco resources when the file changes and the pane unmounts", async () => {
    const firstAdapter = { show: vi.fn(), dispose: vi.fn() };
    const secondAdapter = { show: vi.fn(), dispose: vi.fn() };
    const loadAdapter = vi.fn()
      .mockResolvedValueOnce(firstAdapter)
      .mockResolvedValueOnce(firstAdapter)
      .mockResolvedValue(secondAdapter);
    const view = render(
      <StrictMode>
        <DiffPane identity={identity} file={file} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    await waitFor(() => { expect(firstAdapter.show).toHaveBeenCalledOnce(); });

    const nextFile = { ...file, path: "src/next.ts" };
    view.rerender(
      <StrictMode>
        <DiffPane identity={identity} file={nextFile} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    await waitFor(() => { expect(secondAdapter.show).toHaveBeenCalledOnce(); });
    expect(firstAdapter.dispose).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(secondAdapter.dispose).toHaveBeenCalledOnce();
  });

  it("announces load failures and retries from the related control", async () => {
    const user = userEvent.setup();
    const adapter = { show: vi.fn(), dispose: vi.fn() };
    const loadAdapter = vi.fn()
      .mockRejectedValueOnce(new Error("worker failed"))
      .mockRejectedValueOnce(new Error("worker failed"))
      .mockResolvedValueOnce(adapter);
    render(
      <StrictMode>
        <DiffPane identity={identity} file={file} loadAdapter={loadAdapter} />
      </StrictMode>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "diff 편집기를 열 수 없습니다. 현재 파일의 diff를 다시 열어 주세요.",
    );
    const retry = screen.getByRole("button", { name: "diff 다시 열기" });
    await user.click(retry);
    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    expect(retry).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", {
      name: "읽기 전용 diff: src/app.ts · 원본과 통합 결과",
    })).toHaveFocus();
  });
});
