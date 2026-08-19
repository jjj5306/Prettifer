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
  it("restores the selected-result editor state after closing a history change", async () => {
    const viewState = { modified: { scrollTop: 320, lineNumber: 18, column: 4 } };
    const selectedAdapter = {
      show: vi.fn(),
      saveViewState: vi.fn().mockReturnValue(viewState),
      dispose: vi.fn(),
    };
    const historyAdapter = { show: vi.fn(), dispose: vi.fn() };
    const restoredAdapter = {
      show: vi.fn(),
      restoreViewState: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn()
      .mockResolvedValueOnce(selectedAdapter)
      .mockResolvedValueOnce(historyAdapter)
      .mockResolvedValueOnce(restoredAdapter);
    const historyState = {
      status: "ready" as const,
      requestId: "history-change-1",
      rangeRevision: "range-1",
      change: {
        commitId: "d".repeat(40),
        parentCommit: "c".repeat(40),
        parentNumber: 1,
        path: file.path,
        status: "modified" as const,
        binary: false as const,
        beforeContent: "history before",
        afterContent: "history after",
        beforeSize: 14,
        afterSize: 13,
      },
    };
    const { rerender } = render(
      <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />,
    );
    await waitFor(() => { expect(selectedAdapter.show).toHaveBeenCalled(); });

    rerender(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        fileCommit={historyState}
        loadAdapter={loadAdapter}
      />,
    );
    await waitFor(() => { expect(historyAdapter.show).toHaveBeenCalled(); });
    rerender(
      <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />,
    );
    await waitFor(() => { expect(restoredAdapter.show).toHaveBeenCalled(); });

    expect(selectedAdapter.saveViewState).toHaveBeenCalledOnce();
    expect(restoredAdapter.restoreViewState).toHaveBeenCalledWith(viewState);
  });

  it("restores the editor state after the file history took the panel's place", async () => {
    const viewState = { modified: { scrollTop: 512, lineNumber: 41, column: 2 } };
    const leaving = {
      show: vi.fn(),
      saveViewState: vi.fn().mockReturnValue(viewState),
      dispose: vi.fn(),
    };
    const returning = {
      show: vi.fn(),
      restoreViewState: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn()
      .mockResolvedValueOnce(leaving)
      .mockResolvedValueOnce(returning);
    const { unmount } = render(
      <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />,
    );
    await waitFor(() => { expect(leaving.show).toHaveBeenCalled(); });

    // The history list replaces this panel entirely, so the position has to
    // survive the panel itself going away.
    unmount();
    render(
      <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />,
    );
    await waitFor(() => { expect(returning.show).toHaveBeenCalled(); });

    expect(leaving.saveViewState).toHaveBeenCalledOnce();
    expect(returning.restoreViewState).toHaveBeenCalledWith(viewState);
  });

  it("shows a file history commit in the same diff area and returns to the result", async () => {
    const user = userEvent.setup();
    const adapter = { show: vi.fn(), dispose: vi.fn() };
    const onCloseFileCommit = vi.fn();
    render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        fileCommit={{
          status: "ready",
          requestId: "history-change-1",
          rangeRevision: "range-1",
          change: {
            commitId: "d".repeat(40),
            parentCommit: "c".repeat(40),
            parentNumber: 1,
            path: "src/app.ts",
            status: "modified",
            binary: false,
            beforeContent: "history before",
            afterContent: "history after",
            beforeSize: 14,
            afterSize: 13,
          },
        }}
        onCloseFileCommit={onCloseFileCommit}
        loadAdapter={vi.fn().mockResolvedValue(adapter)}
      />,
    );

    await waitFor(() => { expect(adapter.show).toHaveBeenCalled(); });
    expect(screen.getByRole("heading", { name: "File History Change" })).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveAccessibleName(/commit ddddddd compared with parent 1/u);
    await user.click(screen.getByRole("button", { name: "Back to File History" }));
    expect(onCloseFileCommit).toHaveBeenCalledOnce();
  });

  it("shows binary history metadata without loading contents", () => {
    const loadAdapter = vi.fn();
    render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        fileCommit={{
          status: "ready",
          requestId: "history-change-1",
          rangeRevision: "range-1",
          change: {
            commitId: "d".repeat(40),
            parentCommit: "c".repeat(40),
            parentNumber: 1,
            path: "assets/data.bin",
            status: "modified",
            binary: true,
            beforeContent: null,
            afterContent: null,
            beforeSize: 5,
            afterSize: 6,
          },
        }}
        loadAdapter={loadAdapter}
      />,
    );

    expect(loadAdapter).not.toHaveBeenCalled();
    expect(screen.getByText("Binary content comparison is not available")).toBeVisible();
    expect(screen.getByText("Blob sizes: 5 bytes → 6 bytes")).toBeVisible();
  });

  it("loads Monaco only after a result file is selected", async () => {
    const adapter = { show: vi.fn(), dispose: vi.fn() };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const { rerender } = render(
      <StrictMode>
        <DiffPane isCurrentRegion={false} identity={identity} file={null} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    expect(loadAdapter).not.toHaveBeenCalled();
    expect(screen.getByText("Select a changed file to review.")).toBeVisible();

    rerender(
      <StrictMode>
        <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    expect(screen.getByText("Loading diff editor…")).toBeVisible();
    await waitFor(() => {
      expect(adapter.show).toHaveBeenCalledWith(expect.any(HTMLElement), identity, file, { view: "sideBySide" });
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
        <DiffPane isCurrentRegion={false} identity={identity} file={addedFile} loadAdapter={loadAdapter} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(adapter.show).toHaveBeenCalledWith(expect.any(HTMLElement), identity, addedFile, { view: "sideBySide" });
    });
    expect(screen.getByRole("heading", { name: "Added File" })).toBeVisible();
    expect(screen.getByTitle("src/new.ts")).toBeVisible();
    expect(screen.getByRole("textbox", {
      name: "Read-only added file: src/new.ts · full contents added by the selected result",
    })).toBeVisible();
  });

  it("reviews a renamed file as a comparison naming both of its paths", async () => {
    const adapter = { show: vi.fn(), dispose: vi.fn() };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const movedFile = {
      path: "lib/moved.ts",
      status: "renamed" as const,
      previousPath: "src/moved.ts",
      similarity: 87,
      beforeContent: "before",
      afterContent: "after",
    };
    render(
      <StrictMode>
        <DiffPane isCurrentRegion={false} identity={identity} file={movedFile} loadAdapter={loadAdapter} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(adapter.show).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        identity,
        movedFile,
        { view: "sideBySide" },
      );
    });
    expect(screen.getByRole("heading", { name: "Renamed File" })).toBeVisible();
    expect(screen.getByTitle("lib/moved.ts")).toBeVisible();
    // Both paths and the judgement the rename rests on.
    expect(screen.getByTitle("src/moved.ts")).toBeVisible();
    expect(screen.getByText(/87% of the content matched/u))
      .toHaveTextContent("Renamed from src/moved.ts · 87% of the content matched");
    // The left side is the file where it used to be, so the name says so.
    expect(screen.getByRole("textbox", {
      name: "Read-only diff: lib/moved.ts · base at src/moved.ts and selected result",
    })).toBeVisible();
    // A rename still has two sides, so the layout can be arranged.
    expect(screen.getByRole("group", { name: "Diff layout" })).toBeVisible();
  });

  it("names both paths of a renamed binary file", () => {
    const loadAdapter = vi.fn();
    render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={{
          path: "assets/logo-v2.png",
          status: "renamed",
          previousPath: "assets/logo.png",
          similarity: 100,
          binary: true,
          beforeContent: null,
          afterContent: null,
        }}
        loadAdapter={loadAdapter}
      />,
    );

    expect(loadAdapter).not.toHaveBeenCalled();
    expect(screen.getByText("Binary file")).toBeVisible();
    expect(screen.getByText(/100% of the content matched/u))
      .toHaveTextContent("Renamed from assets/logo.png · 100% of the content matched");
  });

  it("shows a readable binary state without loading Monaco", () => {
    const loadAdapter = vi.fn();
    render(
      <DiffPane
        isCurrentRegion={false}
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
        <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />
      </StrictMode>,
    );
    await waitFor(() => { expect(firstAdapter.show).toHaveBeenCalledOnce(); });

    const nextFile = { ...file, path: "src/next.ts" };
    view.rerender(
      <StrictMode>
        <DiffPane isCurrentRegion={false} identity={identity} file={nextFile} loadAdapter={loadAdapter} />
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
        <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />
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
        isCurrentRegion={false}
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
        isCurrentRegion={false}
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
      <DiffPane isCurrentRegion={false} identity={identity} file={file} problem={null} loadAdapter={loadAdapter} />,
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
          isCurrentRegion={false}
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
        { view: "sideBySide" },
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
      <DiffPane isCurrentRegion={false} identity={identity} file={file} reveal={{ path: file.path, line: 4, column: 1 }} loadAdapter={loadAdapter} />,
    );
    await waitFor(() => { expect(adapter.reveal).toHaveBeenCalledWith(4, 1); });
    const loads = loadAdapter.mock.calls.length;

    rerender(
      <DiffPane isCurrentRegion={false} identity={identity} file={file} reveal={{ path: file.path, line: 9, column: 7 }} loadAdapter={loadAdapter} />,
    );

    await waitFor(() => { expect(adapter.reveal).toHaveBeenCalledWith(9, 7); });
    expect(loadAdapter.mock.calls).toHaveLength(loads);
  });

  it("says a file outside the result is opening, and why it could not be", () => {
    const loadAdapter = vi.fn();
    const { rerender } = render(
      <DiffPane
        isCurrentRegion={false}
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
        isCurrentRegion={false}
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
        isCurrentRegion={false}
        identity={identity}
        file={file}
        onSymbol={onSymbol}
        loadAdapter={loadAdapter}
      />,
    );

    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    const hooks = adapter.show.mock.calls[0]?.[3] as { onSymbol: typeof onSymbol };
    hooks.onSymbol("UtVar", "references", "plain");

    expect(onSymbol).toHaveBeenCalledWith("UtVar", "references", "plain");
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
      <DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />,
    );
    // The directory and the file name are separate so the name never truncates.
    expect(screen.getByText("src/")).toBeVisible();
    expect(screen.getByText("app.ts")).toBeVisible();

    rerender(
      <DiffPane
        isCurrentRegion={false}
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
        isCurrentRegion={false}
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

  it("keeps the editor across renders that only replace the symbol handler", async () => {
    const adapter = {
      show: vi.fn(),
      showDocument: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const { rerender } = render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        onSymbol={() => undefined}
        loadAdapter={loadAdapter}
      />,
    );
    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });

    // The parent rebuilds this arrow on every render; the editor must not care.
    for (let index = 0; index < 3; index += 1) {
      rerender(
        <DiffPane
          isCurrentRegion={false}
          identity={identity}
          file={file}
          onSymbol={() => undefined}
          loadAdapter={loadAdapter}
        />,
      );
    }

    // One editor, never disposed: a rebuilt editor would lose the scroll position.
    expect(adapter.show).toHaveBeenCalledOnce();
    expect(adapter.dispose).not.toHaveBeenCalled();
    expect(loadAdapter).toHaveBeenCalledOnce();
  });

  it("routes a symbol request to the handler of the current render", async () => {
    const adapter = {
      show: vi.fn(),
      showDocument: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    };
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <DiffPane isCurrentRegion={false} identity={identity} file={file} onSymbol={first} loadAdapter={loadAdapter} />,
    );
    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    rerender(
      <DiffPane isCurrentRegion={false} identity={identity} file={file} onSymbol={second} loadAdapter={loadAdapter} />,
    );

    // The editor still holds the hook it was given first.
    const hooks = adapter.show.mock.calls[0]?.[3] as {
      onSymbol: (s: string, m: string, u: string) => void;
    };
    hooks.onSymbol("UtVar", "definition", "construction");

    expect(second).toHaveBeenCalledWith("UtVar", "definition", "construction");
    expect(first).not.toHaveBeenCalled();
  });

  /** An adapter whose calls a test can read back. */
  function createAdapter() {
    return {
      show: vi.fn(),
      showDocument: vi.fn(),
      reveal: vi.fn(),
      setView: vi.fn(),
      dispose: vi.fn(),
    };
  }

  it("names a comparison after the review instead of its layout", async () => {
    const adapter = createAdapter();
    render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        loadAdapter={vi.fn().mockResolvedValue(adapter)}
      />,
    );

    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    expect(screen.getByRole("heading", { name: "Differentia Codicis" })).toBeVisible();
    // The layout lives in the toggle beside the heading, not in the name.
    expect(screen.queryByRole("heading", { name: /side-by-side/iu })).toBeNull();
  });

  it("offers the layout toggle on a comparison, with side-by-side selected", async () => {
    const adapter = createAdapter();
    render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        loadAdapter={vi.fn().mockResolvedValue(adapter)}
      />,
    );

    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    expect(screen.getByRole("button", { name: "Side-by-side" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Inline" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("changes the layout without loading the editor again", async () => {
    const user = userEvent.setup();
    const adapter = createAdapter();
    const loadAdapter = vi.fn().mockResolvedValue(adapter);
    render(<DiffPane isCurrentRegion={false} identity={identity} file={file} loadAdapter={loadAdapter} />);
    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });

    await user.click(screen.getByRole("button", { name: "Inline" }));

    expect(adapter.setView).toHaveBeenLastCalledWith("inline");
    expect(screen.getByRole("button", { name: "Inline" }))
      .toHaveAttribute("aria-pressed", "true");
    // The editor is untouched, so the reader keeps their place.
    expect(loadAdapter).toHaveBeenCalledOnce();
    expect(adapter.show).toHaveBeenCalledOnce();
    expect(adapter.dispose).not.toHaveBeenCalled();
  });

  it("keeps the chosen layout when another file is reviewed", async () => {
    const user = userEvent.setup();
    const adapter = createAdapter();
    const { rerender } = render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        loadAdapter={vi.fn().mockResolvedValue(adapter)}
      />,
    );
    await waitFor(() => { expect(adapter.show).toHaveBeenCalledOnce(); });
    await user.click(screen.getByRole("button", { name: "Inline" }));

    rerender(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={{
          path: "src/other.ts",
          status: "modified",
          beforeContent: "a",
          afterContent: "b",
        }}
        loadAdapter={vi.fn().mockResolvedValue(adapter)}
      />,
    );

    await waitFor(() => { expect(adapter.show).toHaveBeenCalledTimes(2); });
    expect(adapter.show.mock.calls[1]?.[3]).toEqual({ view: "inline" });
    expect(screen.getByRole("button", { name: "Inline" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["an added file", {
      path: "src/new.ts",
      status: "added" as const,
      beforeContent: null,
      afterContent: "added",
    }],
    ["a binary file", {
      path: "docs/logo.png",
      status: "modified" as const,
      binary: true as const,
      beforeContent: null,
      afterContent: null,
    }],
  ])("offers no layout toggle for %s", async (_name, target) => {
    const adapter = createAdapter();
    render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={target}
        loadAdapter={vi.fn().mockResolvedValue(adapter)}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "Diff layout" })).toBeNull();
    });
  });

  it("offers no layout toggle for a file outside the result", async () => {
    const adapter = createAdapter();
    render(
      <DiffPane
        isCurrentRegion={false}
        identity={identity}
        file={file}
        externalFile={{
          status: "ready",
          path: "src/UtVar.java",
          contents: "public class UtVar {}",
        }}
        loadAdapter={vi.fn().mockResolvedValue(adapter)}
      />,
    );

    await waitFor(() => { expect(adapter.showDocument).toHaveBeenCalledOnce(); });
    expect(screen.queryByRole("group", { name: "Diff layout" })).toBeNull();
  });
});
