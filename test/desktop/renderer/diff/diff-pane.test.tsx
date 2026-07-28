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
    expect(screen.getByText("Select a changed file to review.")).toBeVisible();

    rerender(
      <StrictMode>
        <DiffPane identity={identity} file={file} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    expect(screen.getByText("Loading diff editor…")).toBeVisible();
    await waitFor(() => {
      expect(adapter.show).toHaveBeenCalledWith(expect.any(HTMLElement), identity, file);
    });
    expect(screen.getByRole("textbox", {
      name: "Read-only diff: src/app.ts · base and selected result",
    })).toBeVisible();
    expect(screen.getByText("Base on the left · selected result on the right")).toBeVisible();
  });

  it("reviews an added file as full contents instead of a base comparison", async () => {
    const adapter = { show: vi.fn(), dispose: vi.fn() };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const addedFile = {
      path: "src/new.ts",
      status: "added" as const,
      beforeContent: null,
      afterContent: "added",
    };
    render(
      <StrictMode>
        <DiffPane identity={identity} file={addedFile} loadAdapter={loadAdapter} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(adapter.show).toHaveBeenCalledWith(expect.any(HTMLElement), identity, addedFile);
    });
    expect(screen.getByRole("heading", { name: "Added File" })).toBeVisible();
    expect(screen.getByText(
      "New file · every line is part of the selected result",
    )).toBeVisible();
    expect(screen.getByRole("textbox", {
      name: "Read-only added file: src/new.ts · full contents added by the selected result",
    })).toBeVisible();
    expect(screen.queryByText(
      "Base on the left · selected result on the right",
    )).toBeNull();
  });

  it("shows a readable binary state without loading Monaco", () => {
    const loadAdapter = vi.fn();
    render(
      <DiffPane
        identity={identity}
        file={{
          path: "fixtures/project.csp",
          status: "added",
          binary: true,
          beforeContent: null,
          afterContent: null,
        }}
        loadAdapter={loadAdapter}
      />,
    );

    expect(loadAdapter).not.toHaveBeenCalled();
    expect(screen.getByText("Binary file")).toBeVisible();
    expect(screen.getByText(
      "Text diff is not available for this file. Its binary contents were not loaded.",
    )).toBeVisible();
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
      "The diff editor could not open. Retry the current file.",
    );
    const retry = screen.getByRole("button", { name: "Retry Diff" });
    await user.click(retry);
    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    expect(retry).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", {
      name: "Read-only diff: src/app.ts · base and selected result",
    })).toHaveFocus();
  });
});
