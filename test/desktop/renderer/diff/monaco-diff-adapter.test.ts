// @vitest-environment jsdom

import { describe, expect, it, vi, type Mock } from "vitest";

import {
  ADDED_LINE_CLASS_NAME,
  MonacoDiffAdapter,
  SYMBOL_LINK_CLASS_NAME,
  TARGET_LINE_CLASS_NAME,
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

/** A decoration collection whose contents a test can read back. */
interface FakeCollection {
  set: Mock<(decorations: never) => void>;
  clear: Mock<() => void>;
  decorations: unknown[];
}

interface FakeEditor {
  setModel: Mock<(model: never) => void>;
  createDecorationsCollection: Mock<(decorations: never) => FakeCollection>;
  dispose: Mock<() => void>;
  revealLineInCenter: Mock<(lineNumber: number) => void>;
  setPosition: Mock<(position: { lineNumber: number; column: number }) => void>;
  getModel: () => FakeModel | null;
  getPosition: () => { lineNumber: number; column: number } | null;
  saveViewState: Mock<() => object | null>;
  restoreViewState: Mock<(state: object) => void>;
  getScrollTop: Mock<() => number>;
  getScrollLeft: Mock<() => number>;
  setScrollPosition: Mock<(position: { scrollTop: number; scrollLeft: number }) => void>;
  onKeyDown: (listener: Listener<never>) => { dispose: Mock<() => void> };
  onKeyUp: (listener: Listener<never>) => { dispose: Mock<() => void> };
  onMouseDown: (listener: Listener<never>) => { dispose: Mock<() => void> };
  onMouseMove: (listener: Listener<never>) => { dispose: Mock<() => void> };
  onMouseLeave: (listener: () => void) => { dispose: Mock<() => void> };
  keyListeners: Listener<never>[];
  keyUpListeners: Listener<never>[];
  mouseListeners: Listener<never>[];
  moveListeners: Listener<never>[];
  leaveListeners: (() => void)[];
  collections: FakeCollection[];
  position: { lineNumber: number; column: number } | null;
  model: FakeModel | null;
  options: unknown;
}

/** The F12 code the fake Monaco reports, matching nothing else. */
const F12 = 70;

function createMonaco() {
  const models: FakeModel[] = [];
  const editors: (FakeEditor & {
    modified: FakeEditor;
    updateOptions: Mock<(options: never) => void>;
    updatedOptions: { renderSideBySide: boolean }[];
  })[] = [];
  const addedEditors: FakeEditor[] = [];

  function createEditor(options: unknown): FakeEditor {
    const editor: FakeEditor = {
      setModel: vi.fn((model: never) => { editor.model = model; }),
      createDecorationsCollection: vi.fn((decorations: never) => {
        const collection: FakeCollection = {
          set: vi.fn((next: never) => { collection.decorations = next; }),
          clear: vi.fn(() => { collection.decorations = []; }),
          decorations,
        };
        editor.collections.push(collection);
        return collection;
      }),
      dispose: vi.fn(() => undefined),
      revealLineInCenter: vi.fn(() => undefined),
      setPosition: vi.fn((position: { lineNumber: number; column: number }) => {
        editor.position = position;
      }),
      getModel: () => editor.model,
      getPosition: () => editor.position,
      saveViewState: vi.fn(() => ({ position: editor.position })),
      restoreViewState: vi.fn(() => undefined),
      getScrollTop: vi.fn(() => 0),
      getScrollLeft: vi.fn(() => 0),
      setScrollPosition: vi.fn(() => undefined),
      onKeyDown: (listener) => {
        editor.keyListeners.push(listener);
        return { dispose: vi.fn(() => undefined) };
      },
      onKeyUp: (listener) => {
        editor.keyUpListeners.push(listener);
        return { dispose: vi.fn(() => undefined) };
      },
      onMouseDown: (listener) => {
        editor.mouseListeners.push(listener);
        return { dispose: vi.fn(() => undefined) };
      },
      onMouseMove: (listener) => {
        editor.moveListeners.push(listener);
        return { dispose: vi.fn(() => undefined) };
      },
      onMouseLeave: (listener) => {
        editor.leaveListeners.push(listener);
        return { dispose: vi.fn(() => undefined) };
      },
      keyListeners: [],
      keyUpListeners: [],
      mouseListeners: [],
      moveListeners: [],
      leaveListeners: [],
      collections: [],
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
            updateOptions: vi.fn((next: { renderSideBySide: boolean }) => {
              editor.updatedOptions.push(next);
            }),
            updatedOptions: [] as { renderSideBySide: boolean }[],
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
        updateOptions: vi.fn(() => undefined),
        updatedOptions: [] as { renderSideBySide: boolean }[],
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

    // `class Caller { UtVar value; }` is not a construction.
    expect(onSymbol).toHaveBeenCalledWith("UtVar", "definition", "plain");
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
      ["UtVar", "definition", "plain"],
      ["UtVar", "references", "plain"],
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
    // No added-line decoration: nothing in this file belongs to the selection. The
    // two collections that exist are the empty link and target marks.
    expect(fixture.addedEditors[0]?.createDecorationsCollection.mock.calls)
      .toEqual([[[]], [[]]]);
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

  /** The reviewed side of a diff over one line of Java-like code. */
  function reviewing(onSymbol = vi.fn()) {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    // Attached to the document so document-level key events reach the adapter.
    const host = document.createElement("div");
    document.body.append(host);
    adapter.show(host, identity, {
      path: "src/Caller.java",
      status: "modified",
      beforeContent: "class Caller {}",
      afterContent: "class Caller { UtVar value; }",
    }, { onSymbol });
    const modified = fixture.editors[0]!.modified;
    return { fixture, adapter, modified, onSymbol, host };
  }

  it("marks the identifier under the pointer while the modifier is held", () => {
    const { modified } = reviewing();
    const [linkMark] = modified.collections;

    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: true, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);

    // Exactly the range a modifier-click at that position would follow.
    expect(linkMark?.decorations).toEqual([{
      range: { startLineNumber: 1, startColumn: 16, endLineNumber: 1, endColumn: 21 },
      options: { inlineClassName: SYMBOL_LINK_CLASS_NAME },
    }]);
  });

  it("marks nothing while the modifier is not held", () => {
    const { modified } = reviewing();
    const [linkMark] = modified.collections;

    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: false, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);

    expect(linkMark?.decorations).toEqual([]);
    expect(linkMark?.set).not.toHaveBeenCalled();
  });

  it("marks on the modifier press alone, using where the pointer already was", () => {
    const { modified } = reviewing();
    const [linkMark] = modified.collections;
    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: false, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);

    modified.keyListeners[0]?.({
      keyCode: 5, shiftKey: false, ctrlKey: true, metaKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    } as never);

    expect(linkMark?.decorations).toHaveLength(1);
  });

  it("takes the mark away when the modifier is released", () => {
    const { modified } = reviewing();
    const [linkMark] = modified.collections;
    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: true, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);
    expect(linkMark?.decorations).toHaveLength(1);

    modified.keyUpListeners[0]?.({
      keyCode: 5, shiftKey: false, ctrlKey: false, metaKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(),
    } as never);

    expect(linkMark?.clear).toHaveBeenCalled();
    expect(linkMark?.decorations).toEqual([]);
  });

  it("takes the mark away when the pointer leaves the identifier", () => {
    const { modified } = reviewing();
    const [linkMark] = modified.collections;
    const move = modified.moveListeners[0];
    move?.({
      event: { leftButton: false, ctrlKey: true, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);

    // Column 14 is the space between `{` and `UtVar`.
    move?.({
      event: { leftButton: false, ctrlKey: true, metaKey: false },
      target: { position: { lineNumber: 1, column: 15 } },
    } as never);

    expect(linkMark?.decorations).toEqual([]);
  });

  it("keeps one mark instead of a growing pile", () => {
    const { modified } = reviewing();
    const [linkMark] = modified.collections;
    const move = modified.moveListeners[0];

    for (const column of [16, 17, 18]) {
      move?.({
        event: { leftButton: false, ctrlKey: true, metaKey: false },
        target: { position: { lineNumber: 1, column } },
      } as never);
    }

    expect(modified.createDecorationsCollection.mock.calls).toHaveLength(2);
    expect(linkMark?.decorations).toHaveLength(1);
  });

  it("puts the cursor on the column it was given and marks the arrival", () => {
    const { modified, adapter } = reviewing();
    const targetMark = modified.collections[1];

    adapter.reveal(1, 16);

    expect(modified.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 16 });
    expect(targetMark?.decorations).toEqual([{
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: TARGET_LINE_CLASS_NAME,
        marginClassName: TARGET_LINE_CLASS_NAME,
      },
    }]);
  });

  it("falls back to the start of the line when no column is given", () => {
    const { modified, adapter } = reviewing();

    adapter.reveal(1);

    expect(modified.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 });
  });

  it("takes the mark away when the modifier is released outside the editor", () => {
    const { modified, adapter } = reviewing();
    const [linkMark] = modified.collections;
    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: true, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);
    expect(linkMark?.decorations).toHaveLength(1);

    // The editor never had keyboard focus, so only the document sees this.
    document.dispatchEvent(new KeyboardEvent("keyup", { ctrlKey: false }));

    expect(linkMark?.decorations).toEqual([]);
    adapter.dispose();
  });

  it("marks on a modifier press the editor never received", () => {
    const { modified, adapter } = reviewing();
    const [linkMark] = modified.collections;
    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: false, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);

    document.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));

    expect(linkMark?.decorations).toHaveLength(1);
    adapter.dispose();
  });

  it("stops watching the modifier once the view is gone", () => {
    const { modified, adapter } = reviewing();
    const [linkMark] = modified.collections;
    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: false, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);
    adapter.dispose();
    linkMark?.set.mockClear();

    document.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));

    expect(linkMark?.set).not.toHaveBeenCalled();
  });

  it("takes the mark away when the pointer leaves the editor", () => {
    const { modified, adapter } = reviewing();
    const [linkMark] = modified.collections;
    modified.moveListeners[0]?.({
      event: { leftButton: false, ctrlKey: true, metaKey: false },
      target: { position: { lineNumber: 1, column: 16 } },
    } as never);

    modified.leaveListeners[0]?.();

    expect(linkMark?.decorations).toEqual([]);
    // A modifier press with the pointer away must not bring the mark back.
    document.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));
    expect(linkMark?.decorations).toEqual([]);
    adapter.dispose();
  });

  it("lays a comparison out side by side unless a view says otherwise", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    adapter.show(document.createElement("div"), identity, {
      path: "src/app.ts",
      status: "modified",
      beforeContent: "before",
      afterContent: "after",
    });

    expect(fixture.editors[0]?.options).toMatchObject({ renderSideBySide: true });
  });

  it("opens a comparison inline when asked", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);

    adapter.show(document.createElement("div"), identity, {
      path: "src/app.ts",
      status: "modified",
      beforeContent: "before",
      afterContent: "after",
    }, { view: "inline" });

    expect(fixture.editors[0]?.options).toMatchObject({ renderSideBySide: false });
  });

  it("changes the layout without rebuilding the editor", () => {
    const { fixture, adapter } = reviewing();
    const editor = fixture.editors[0]!;

    adapter.setView("inline");
    adapter.setView("sideBySide");

    expect(editor.updatedOptions).toEqual([
      { renderSideBySide: false },
      { renderSideBySide: true },
    ]);
    // One editor throughout: rebuilding would lose the scroll position.
    expect(fixture.editors).toHaveLength(1);
    expect(editor.dispose).not.toHaveBeenCalled();
  });

  it("snapshots and restores the complete diff editor view state", () => {
    const { fixture, adapter } = reviewing();
    const editor = fixture.editors[0]!;
    const reviewedState = {
      scrollTop: 420,
      scrollLeft: 12,
      position: { lineNumber: 27, column: 8 },
    };
    editor.modified.getScrollTop.mockReturnValue(reviewedState.scrollTop);
    editor.modified.getScrollLeft.mockReturnValue(reviewedState.scrollLeft);
    editor.modified.position = reviewedState.position;

    const state = adapter.saveViewState();
    expect(state).toEqual({ reviewed: reviewedState });
    if (state === null) {
      throw new Error("The editor did not return a view state.");
    }
    adapter.restoreViewState(state);

    expect(editor.modified.setScrollPosition).toHaveBeenCalledWith({
      scrollTop: reviewedState.scrollTop,
      scrollLeft: reviewedState.scrollLeft,
    });
    expect(editor.modified.setPosition).toHaveBeenCalledWith(reviewedState.position);
  });

  it("ignores a layout change where there is nothing to compare", () => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    adapter.showDocument(document.createElement("div"), identity, "a.ts", "one");

    expect(() => { adapter.setView("inline"); }).not.toThrow();
    expect(fixture.editors).toHaveLength(0);
  });

  it("forgets the comparison once the view is gone", () => {
    const { fixture, adapter } = reviewing();
    const editor = fixture.editors[0]!;
    adapter.dispose();

    adapter.setView("inline");

    expect(editor.updatedOptions).toEqual([]);
  });
});
