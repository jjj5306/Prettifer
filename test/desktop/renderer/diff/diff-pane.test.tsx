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
      expect(adapter.show).toHaveBeenCalledWith(expect.any(HTMLElement), identity, file, {});
    });
    expect(screen.getByRole("textbox", {
      name: "Read-only diff: src/app.ts · base and selected result",
    })).toBeVisible();
    // The heading names the file under review instead of describing the layout.
    expect(screen.getByTitle("src/app.ts")).toBeVisible();
    expect(screen.queryByText(
      "Base on the left · selected result on the right",
    )).toBeNull();
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
      expect(adapter.show).toHaveBeenCalledWith(expect.any(HTMLElement), identity, addedFile, {});
    });
    expect(screen.getByRole("heading", { name: "Added File" })).toBeVisible();
    expect(screen.getByTitle("src/new.ts")).toBeVisible();
    expect(screen.getByRole("textbox", {
      name: "Read-only added file: src/new.ts · full contents added by the selected result",
    })).toBeVisible();
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

  it("shows the problem cause instead of a diff for a problem file", () => {
    const loadAdapter = vi.fn();
    render(
      <DiffPane
        identity={identity}
        file={null}
        problem={{
          path: "src/broken.ts",
          code: "CONTENT_CHOICE_REQUIRED",
          commit: "c".repeat(40),
          nextAction: "Select the prerequisite commits, then build the result again.",
        }}
        loadAdapter={loadAdapter}
      />,
    );

    expect(loadAdapter).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Problem File" })).toBeVisible();
    expect(screen.getByText("This file needs a content choice")).toBeVisible();
    expect(screen.getByText(
      "Select the prerequisite commits, then build the result again.",
    )).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("returns to a diff when a composed file is selected after a problem file", async () => {
    const adapter = { show: vi.fn(), dispose: vi.fn() };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const { rerender } = render(
      <DiffPane
        identity={identity}
        file={null}
        problem={{
          path: "src/broken.ts",
          code: "CONTENT_CHOICE_REQUIRED",
          commit: "c".repeat(40),
          nextAction: "Select the prerequisite commits, then build the result again.",
        }}
        loadAdapter={loadAdapter}
      />,
    );
    expect(screen.getByRole("heading", { name: "Problem File" })).toBeVisible();

    rerender(
      <DiffPane identity={identity} file={file} problem={null} loadAdapter={loadAdapter} />,
    );

    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    expect(screen.getByRole("textbox", {
      name: "Read-only diff: src/app.ts · base and selected result",
    })).toBeVisible();
  });

  it("shows a file outside the result as its comparison base contents", async () => {
    const adapter = {
      show: vi.fn(),
      showDocument: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    render(
      <StrictMode>
        <DiffPane
          identity={identity}
          file={file}
          externalFile={{
            status: "ready",
            path: "src/UtVar.java",
            contents: "public class UtVar {}",
          }}
          reveal={{ path: "src/UtVar.java", line: 12, column: 14 }}
          loadAdapter={loadAdapter}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(adapter.showDocument).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        identity,
        "src/UtVar.java",
        "public class UtVar {}",
        {},
      );
    });
    // The selected result file is not shown while a file outside it is open.
    expect(adapter.show).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Outside the Selected Result" })).toBeVisible();
    expect(screen.getByTitle("src/UtVar.java")).toBeVisible();
    await waitFor(() => { expect(adapter.reveal).toHaveBeenCalledWith(12, 14); });
  });

  it("reveals another line of the file already open without reloading it", async () => {
    const adapter = {
      show: vi.fn(),
      showDocument: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const { rerender } = render(
      <DiffPane identity={identity} file={file} reveal={{ path: file.path, line: 4, column: 1 }} loadAdapter={loadAdapter} />,
    );
    await waitFor(() => { expect(adapter.reveal).toHaveBeenCalledWith(4, 1); });
    const loads = loadAdapter.mock.calls.length;

    rerender(
      <DiffPane identity={identity} file={file} reveal={{ path: file.path, line: 9, column: 7 }} loadAdapter={loadAdapter} />,
    );

    await waitFor(() => { expect(adapter.reveal).toHaveBeenCalledWith(9, 7); });
    expect(loadAdapter.mock.calls).toHaveLength(loads);
  });

  it("says a file outside the result is opening, and why it could not be", () => {
    const loadAdapter = vi.fn();
    const { rerender } = render(
      <DiffPane
        identity={identity}
        file={file}
        externalFile={{ status: "loading", path: "src/UtVar.java" }}
        loadAdapter={loadAdapter}
      />,
    );
    expect(screen.getByText("Opening the file at the comparison base…")).toBeVisible();
    expect(loadAdapter).not.toHaveBeenCalled();

    rerender(
      <DiffPane
        identity={identity}
        file={file}
        externalFile={{
          status: "error",
          path: "docs/logo.png",
          diagnostic: {
            code: "BASE_FILE_BINARY",
            message: "That file is binary, so it has no text to review.",
            nextAction: "Open the file in a viewer for its format.",
          },
        }}
        loadAdapter={loadAdapter}
      />,
    );

    expect(screen.getByText("This file could not be opened")).toBeVisible();
    expect(screen.getByText("Open the file in a viewer for its format.")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(loadAdapter).not.toHaveBeenCalled();
  });

  it("passes a symbol request from the editor on unchanged", async () => {
    const adapter = {
      show: vi.fn(),
      showDocument: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const onSymbol = vi.fn();
    render(
      <DiffPane
        identity={identity}
        file={file}
        onSymbol={onSymbol}
        loadAdapter={loadAdapter}
      />,
    );

    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    const hooks = adapter.show.mock.calls[0]?.[3] as { onSymbol: typeof onSymbol };
    hooks.onSymbol("UtVar", "references");

    expect(onSymbol).toHaveBeenCalledWith("UtVar", "references");
  });

  it("names the file under review and follows the review to another file", async () => {
    const adapter = {
      show: vi.fn(),
      showDocument: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const { rerender } = render(
      <DiffPane identity={identity} file={file} loadAdapter={loadAdapter} />,
    );
    // The directory and the file name are separate so the name never truncates.
    expect(screen.getByText("src/")).toBeVisible();
    expect(screen.getByText("app.ts")).toBeVisible();

    rerender(
      <DiffPane
        identity={identity}
        file={{
          path: "src/deep/nested/other.ts",
          status: "modified",
          beforeContent: "a",
          afterContent: "b",
        }}
        loadAdapter={loadAdapter}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTitle("src/deep/nested/other.ts")).toBeVisible();
    });
    expect(screen.getByText("other.ts")).toBeVisible();
    expect(screen.queryByTitle("src/app.ts")).toBeNull();
  });

  it("names a file with no directory by its name alone", () => {
    render(
      <DiffPane
        identity={identity}
        file={{
          path: "README.md",
          status: "modified",
          beforeContent: "a",
          afterContent: "b",
        }}
        loadAdapter={vi.fn().mockResolvedValue({
          show: vi.fn(),
          showDocument: vi.fn(),
          reveal: vi.fn(),
          dispose: vi.fn(),
        })}
      />,
    );

    expect(screen.getByTitle("README.md")).toHaveTextContent("README.md");
  });
});
