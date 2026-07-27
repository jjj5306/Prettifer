// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { MonacoDiffAdapter } from "../../../../src/desktop/renderer/diff/MonacoDiffAdapter.js";

function createMonaco() {
  const models: {
    value: string;
    language: string;
    uri: string;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const editors: {
    setModel: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    options: unknown;
  }[] = [];
  return {
    models,
    editors,
    monaco: {
      Uri: { parse: (value: string) => ({ value }) },
      editor: {
        createModel: (value: string, language: string, uri: { value: string }) => {
          const model = { value, language, uri: uri.value, dispose: vi.fn() };
          models.push(model);
          return model;
        },
        createDiffEditor: (_host: HTMLElement, options: unknown) => {
          const editor = { setModel: vi.fn(), dispose: vi.fn(), options };
          editors.push(editor);
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
    ["modified", "before", "after"],
    ["added", "", "after"],
    ["deleted", "before", ""],
  ] as const)("creates read-only %s models", (status, expectedBefore, expectedAfter) => {
    const fixture = createMonaco();
    const adapter = new MonacoDiffAdapter(fixture.monaco);
    adapter.show(document.createElement("div"), identity, {
      path: "src/app.ts",
      status,
      beforeContent: status === "added" ? null : "before",
      afterContent: status === "deleted" ? null : "after",
    });

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
      accessibilitySupport: "on",
      ariaLabel: "원본과 통합 결과 읽기 전용 diff",
    });
    expect(fixture.editors[0]?.setModel).toHaveBeenCalledWith({
      original: fixture.models[0],
      modified: fixture.models[1],
    });
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
});
