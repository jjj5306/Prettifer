// @vitest-environment jsdom

import { describe, expect, it, vi, type Mock } from "vitest";

import {
  ADDED_LINE_CLASS_NAME,
  MonacoDiffAdapter,
} from "../../../../src/desktop/renderer/diff/MonacoDiffAdapter.js";

type Listener<T> = (event: T) => void;

interface FakeModel {
  value: string;
  language: string;
  uri: string;
  getLineCount: () => number;
  getLineContent: (lineNumber: number) => string;
  dispose: Mock<() => void>;
}

interface FakeEditor {
  setModel: Mock<(model: never) => void>;
  createDecorationsCollection: Mock<(decorations: never) => void>;
  dispose: Mock<() => void>;
  revealLineInCenter: Mock<(lineNumber: number) => void>;
  setPosition: Mock<(position: { lineNumber: number; column: number }) => void>;
  getModel: () => FakeModel | null;
  getPosition: () => { lineNumber: number; column: number } | null;
  onKeyDown: (listener: Listener<never>) => { dispose: Mock<() => void> };
  onMouseDown: (listener: Listener<never>) => { dispose: Mock<() => void> };
  keyListeners: Listener<never>[];
  mouseListeners: Listener<never>[];
  position: { lineNumber: number; column: number } | null;
  model: FakeModel | null;
  options: unknown;
}

/** The F12 code the fake Monaco reports, matching nothing else. */
const F12 = 70;

function createMonaco() {
  const models: FakeModel[] = [];
  const editors: (FakeEditor & { modified: FakeEditor })[] = [];
  const addedEditors: FakeEditor[] = [];

  function createEditor(options: unknown): FakeEditor {
    const editor: FakeEditor = {
      setModel: vi.fn((model: never) => { editor.model = model; }),
      createDecorationsCollection: vi.fn(() => undefined),
      dispose: vi.fn(() => undefined),
      revealLineInCenter: vi.fn(() => undefined),
      setPosition: vi.fn((position: { lineNumber: number; column: number }) => {
        editor.position = position;
      }),
      getModel: () => editor.model,
      getPosition: () => editor.position,
      onKeyDown: (listener) => {
        editor.keyListeners.push(listener);
        return { dispose: vi.fn(() => undefined) };
      },
      onMouseDown: (listener) => {
        editor.mouseListeners.push(listener);
        return { dispose: vi.fn(() => undefined) };
      },
      keyListeners: [],
      mouseListeners: [],
      position: null,
      model: null,
      options,
    };
    return editor;
  }

  return {
    models,
    editors,
    addedEditors,
    // Exposed so a test can inject one failing method into a complete editor.
    createEditor,
    monaco: {
      Uri: { parse: (value: string) => ({ value }) },
      KeyCode: { F12 },
      editor: {
        createModel: (value: string, language: string, uri: { value: string }) => {
          const model = {
            value,
            language,
            uri: uri.value,
            getLineCount: () => value.split("\n").length,
            getLineContent: (lineNumber: number) => value.split("\n")[lineNumber - 1] ?? "",
            dispose: vi.fn(() => undefined),
          };
          models.push(model);
          return model;
        },
        createDiffEditor: (_host: HTMLElement, options: unknown) => {
          const modified = createEditor(options);
          const editor = Object.assign(createEditor(options), {
            modified,
            getModifiedEditor: () => modified,
          });
          // Monaco hands each side of the pair to its own editor.
          editor.setModel = vi.fn((pair: never) => {
            const models = pair as unknown as { modified: FakeModel };
            modified.model = models.modified;
          });
          editors.push(editor);
          return editor;
        },
        create: (_host: HTMLElement, options: unknown) => {
          const editor = createEditor(options);
          addedEditors.push(editor);
          return editor;
        },
      },
    },
  };
}

const identity = {
  repositorySessionId: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
};

describe("MonacoDiffAdapter", () => {
  it.each([
    [
      {
        path: "src/app.ts",
        status: "modified",
        beforeContent: "before",
        afterContent: "after",
      },
      "before",
      "after",
    ],
    [
      {
        path: "src/app.ts",
        status: "deleted",
        beforeContent: "before",
        afterContent: null,
      },
      "before",
      "",
    ],
  ] as const)("creates read-only $0.status models", (file, expectedBefore, expectedAfter) => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    adapter.show(document.createElement("div"), identity, file);

    expect(fixture.models.map((model) => model.value)).toEqual([expectedBefore, expectedAfter]);
    expect(fixture.models.map((model) => model.language)).toEqual(["typescript", "typescript"]);
    expect(fixture.models[0]?.uri).toContain("original");
    expect(fixture.models[1]?.uri).toContain("result");
    expect(fixture.editors[0]?.options).toMatchObject({
      readOnly: true,
      theme: "vs-dark",
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: true,
      enableSplitViewResizing: true,
      fontSize: 14,
      lineHeight: 22,
      minimap: { enabled: false },
      accessibilitySupport: "on",
      ariaLabel: "Read-only diff between base and selected result",
    });
    expect(fixture.editors[0]?.setModel).toHaveBeenCalledWith({
      original: fixture.models[0],
      modified: fixture.models[1],
    });
  });

  it("shows an added file as one document with every line marked as added", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    adapter.show(document.createElement("div"), identity, {
      path: "src/new.ts",
      status: "added",
      beforeContent: null,
      afterContent: "one\ntwo\nthree",
    });

    expect(fixture.editors).toHaveLength(0);
    expect(fixture.models.map((model) => model.value)).toEqual(["one\ntwo\nthree"]);
    expect(fixture.models[0]?.uri).toContain("result");
    expect(fixture.models[0]?.uri).not.toContain("original");
    expect(fixture.addedEditors[0]?.setModel).toHaveBeenCalledWith(fixture.models[0]);
    expect(fixture.addedEditors[0]?.options).toMatchObject({
      readOnly: true,
      theme: "vs-dark",
      automaticLayout: true,
      accessibilitySupport: "on",
      ariaLabel: "Read-only contents of a file added by the selected result",
    });
    expect(fixture.addedEditors[0]?.createDecorationsCollection).toHaveBeenCalledWith([
      {
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 3,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: ADDED_LINE_CLASS_NAME,
          marginClassName: ADDED_LINE_CLASS_NAME,
        },
      },
    ]);
  });

  it("disposes the added file editor and its model before replacing the file", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    const host = document.createElement("div");
    adapter.show(host, identity, {
      path: "src/new.ts",
      status: "added",
      beforeContent: null,
      afterContent: "one",
    });
    adapter.show(host, identity, {
      path: "src/app.ts",
      status: "modified",
      beforeContent: "before",
      afterContent: "after",
    });

    expect(fixture.addedEditors[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
  });

  it("disposes the previous editor and both models before replacing a file", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    const host = document.createElement("div");
    adapter.show(host, identity, {
      path: "README.md",
      status: "modified",
      beforeContent: "before",
      afterContent: "after",
    });
    adapter.show(host, identity, {
      path: "notes.txt",
      status: "modified",
      beforeContent: "one",
      afterContent: "two",
    });

    expect(fixture.editors[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[1]?.dispose).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(fixture.editors[1]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[2]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[3]?.dispose).toHaveBeenCalledOnce();
  });

  it("disposes partially-created resources when editor creation fails", () => {
    const fixture = createMonaco();
    fixture.monaco.editor.createDiffEditor = () => {
      throw new Error("editor failed");
    };
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    expect(() => {
      adapter.show(document.createElement("div"), identity, {
        path: "unknown.bin",
        status: "modified",
        beforeContent: "before",
        afterContent: "after",
      });
    }).toThrow("editor failed");
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[1]?.dispose).toHaveBeenCalledOnce();
  });

  it("disposes an added editor and model when model attachment fails", () => {
    const fixture = createMonaco();
    fixture.monaco.editor.create = (_host: HTMLElement, options: unknown) => {
      const editor = fixture.createEditor(options);
      editor.setModel = vi.fn(() => { throw new Error("set model failed"); });
      fixture.addedEditors.push(editor);
      return editor;
    };
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    expect(() => {
      adapter.show(document.createElement("div"), identity, {
        path: "src/new.ts",
        status: "added",
        beforeContent: null,
        afterContent: "new",
      });
    }).toThrow("set model failed");
    expect(fixture.addedEditors[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
  });

  it("disposes an added editor and model when decoration setup fails", () => {
    const fixture = createMonaco();
    fixture.monaco.editor.create = (_host: HTMLElement, options: unknown) => {
      const editor = fixture.createEditor(options);
      editor.createDecorationsCollection = vi.fn(() => {
        throw new Error("decorations failed");
      });
      fixture.addedEditors.push(editor);
      return editor;
    };
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    expect(() => {
      adapter.show(document.createElement("div"), identity, {
        path: "src/new.ts",
        status: "added",
        beforeContent: null,
        afterContent: "new",
      });
    }).toThrow("decorations failed");
    expect(fixture.addedEditors[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
  });

  it("disposes a diff editor and both models when model attachment fails", () => {
    const fixture = createMonaco();
    fixture.monaco.editor.createDiffEditor = (
      _host: HTMLElement,
      options: unknown,
    ) => {
      const modified = fixture.createEditor(options);
      const editor = Object.assign(fixture.createEditor(options), {
        modified,
        getModifiedEditor: () => modified,
      });
      editor.setModel = vi.fn(() => { throw new Error("set diff model failed"); });
      fixture.editors.push(editor);
      return editor;
    };
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    expect(() => {
      adapter.show(document.createElement("div"), identity, {
        path: "src/app.ts",
        status: "modified",
        beforeContent: "old",
        afterContent: "new",
      });
    }).toThrow("set diff model failed");
    expect(fixture.editors[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[1]?.dispose).toHaveBeenCalledOnce();
  });

  it("disposes the first model when creating the second model fails", () => {
    const fixture = createMonaco();
    const createModel = fixture.monaco.editor.createModel;
    let modelCount = 0;
    fixture.monaco.editor.createModel = (value, language, uri) => {
      modelCount += 1;
      if (modelCount === 2) {
        throw new Error("result model failed");
      }
      return createModel(value, language, uri);
    };
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    expect(() => {
      adapter.show(document.createElement("div"), identity, {
        path: "src/app.ts",
        status: "modified",
        beforeContent: "old",
        afterContent: "new",
      });
    }).toThrow("result model failed");
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.editors).toHaveLength(0);
  });

  it("asks for the declaration of the symbol under a Ctrl+Click", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    const onSymbol = vi.fn();
    adapter.show(document.createElement("div"), identity, {
      path: "src/Caller.java",
      status: "modified",
      beforeContent: "class Caller {}",
      afterContent: "class Caller { UtVar value; }",
    }, { onSymbol });

    // Column 16 is inside `UtVar` on the result side.
    fixture.editors[0]?.modified.mouseListeners[0]?.({
      event: { leftButton: true, ctrlKey: true, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);

    expect(onSymbol).toHaveBeenCalledWith("UtVar", "definition");
  });

  it("ignores a plain click and a click on nothing", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    const onSymbol = vi.fn();
    adapter.show(document.createElement("div"), identity, {
      path: "src/Caller.java",
      status: "modified",
      beforeContent: "class Caller {}",
      afterContent: "class Caller { UtVar value; }",
    }, { onSymbol });
    const listener = fixture.editors[0]?.modified.mouseListeners[0];

    listener?.({
      event: { leftButton: true, ctrlKey: false, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);
    listener?.({
      event: { leftButton: true, ctrlKey: true, metaKey: false },
      target: { position: null },
    } as never);

    expect(onSymbol).not.toHaveBeenCalled();
  });

  it("reads F12 as the declaration and Shift+F12 as the references", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    const onSymbol = vi.fn();
    adapter.show(document.createElement("div"), identity, {
      path: "src/Caller.java",
      status: "modified",
      beforeContent: "class Caller {}",
      afterContent: "class Caller { UtVar value; }",
    }, { onSymbol });
    const modified = fixture.editors[0]?.modified;
    modified?.setPosition({ lineNumber: 1, column: 16 });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    modified?.keyListeners[0]?.({
      keyCode: 70, shiftKey: false, preventDefault, stopPropagation,
    } as never);
    modified?.keyListeners[0]?.({
      keyCode: 70, shiftKey: true, preventDefault, stopPropagation,
    } as never);
    // Another key must reach the editor untouched.
    modified?.keyListeners[0]?.({
      keyCode: 9, shiftKey: false, preventDefault, stopPropagation,
    } as never);

    expect(onSymbol.mock.calls).toEqual([
      ["UtVar", "definition"],
      ["UtVar", "references"],
    ]);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it("shows a file outside the result as one document and reveals a line in it", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    adapter.showDocument(
      document.createElement("div"),
      identity,
      "src/UtVar.java",
      "package a;\npublic class UtVar {}",
    );
    adapter.reveal(2);

    expect(fixture.editors).toHaveLength(0);
    expect(fixture.models[0]?.language).toBe("java");
    expect(fixture.models[0]?.uri).toContain("base");
    // No added-line decoration: nothing in this file belongs to the selection.
    expect(fixture.addedEditors[0]?.createDecorationsCollection).not.toHaveBeenCalled();
    expect(fixture.addedEditors[0]?.revealLineInCenter).toHaveBeenCalledWith(2);
    expect(fixture.addedEditors[0]?.setPosition)
      .toHaveBeenCalledWith({ lineNumber: 2, column: 1 });
  });

  it("reveals a line on the result side of a diff", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    adapter.show(document.createElement("div"), identity, {
      path: "src/app.ts",
      status: "modified",
      beforeContent: "before",
      afterContent: "after",
    });

    adapter.reveal(3);

    expect(fixture.editors[0]?.modified.revealLineInCenter).toHaveBeenCalledWith(3);
    expect(fixture.editors[0]?.revealLineInCenter).not.toHaveBeenCalled();
  });

  it("ignores a reveal with no editor and a line that is not a line", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    adapter.reveal(4);
    adapter.showDocument(document.createElement("div"), identity, "a.ts", "one");
    adapter.reveal(0);

    expect(fixture.addedEditors[0]?.revealLineInCenter).not.toHaveBeenCalled();
  });

  it("disposes the document editor and its model before showing another file", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    const host = document.createElement("div");

    adapter.showDocument(host, identity, "src/UtVar.java", "class UtVar {}");
    adapter.showDocument(host, identity, "src/Other.java", "class Other {}");

    expect(fixture.addedEditors[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
  });

  it("disposes a document editor and model when model attachment fails", () => {
    const fixture = createMonaco();
    fixture.monaco.editor.create = (_host: HTMLElement, options: unknown) => {
      const editor = fixture.createEditor(options);
      editor.setModel = vi.fn(() => { throw new Error("document model failed"); });
      fixture.addedEditors.push(editor);
      return editor;
    };
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    expect(() => {
      adapter.showDocument(document.createElement("div"), identity, "a.ts", "one");
    }).toThrow("document model failed");
    expect(fixture.addedEditors[0]?.dispose).toHaveBeenCalledOnce();
    expect(fixture.models[0]?.dispose).toHaveBeenCalledOnce();
    // A failed view leaves nothing to reveal into.
    adapter.reveal(1);
    expect(fixture.addedEditors[0]?.revealLineInCenter).not.toHaveBeenCalled();
  });
});
