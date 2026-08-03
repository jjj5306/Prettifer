import type { CompositeDiffResultDto } from "../../shared/index.js";
import { symbolAt } from "../../../symbols/symbol-at.js";

type CompositeFile = CompositeDiffResultDto["files"][number];
type TextCompositeFile = Exclude<CompositeFile, { binary: true }>;

/** Monaco decoration class that paints an added line, styled in DiffPane.module.css. */
export const ADDED_LINE_CLASS_NAME = "prettifer-added-line";

interface Disposable {
  dispose(): void;
}

interface TextModel extends Disposable {
  getLineCount(): number;
  getLineContent(lineNumber: number): string;
}

interface EditorPosition {
  readonly lineNumber: number;
  readonly column: number;
}

interface EditorKeyboardEvent {
  readonly keyCode: number;
  readonly shiftKey: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface EditorMouseEvent {
  readonly event: {
    readonly leftButton: boolean;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
  };
  readonly target: { readonly position: EditorPosition | null };
}

/** What the user asked of the symbol under the cursor. */
export type SymbolRequestMode = "definition" | "references";

export type SymbolRequestHandler = (symbol: string, mode: SymbolRequestMode) => void;

export interface DiffViewHooks {
  readonly onSymbol?: SymbolRequestHandler;
}

interface DiffEditor extends Disposable {
  setModel(model: {
    readonly original: TextModel;
    readonly modified: TextModel;
  }): void;
  getModifiedEditor(): CodeEditor;
}

interface LineDecoration {
  readonly range: {
    readonly startLineNumber: number;
    readonly startColumn: number;
    readonly endLineNumber: number;
    readonly endColumn: number;
  };
  readonly options: {
    readonly isWholeLine: boolean;
    readonly className: string;
    readonly marginClassName: string;
  };
}

interface CodeEditor extends Disposable {
  setModel(model: TextModel): void;
  createDecorationsCollection(decorations: readonly LineDecoration[]): void;
  getModel(): TextModel | null;
  getPosition(): EditorPosition | null;
  setPosition(position: EditorPosition): void;
  revealLineInCenter(lineNumber: number): void;
  onKeyDown(listener: (event: EditorKeyboardEvent) => void): Disposable;
  onMouseDown(listener: (event: EditorMouseEvent) => void): Disposable;
}

interface MonacoUri {
  readonly value?: string;
}

export interface MonacoApi {
  readonly Uri: {
    parse(value: string): MonacoUri;
  };
  /** Only F12 is used, so only F12 is depended on. */
  readonly KeyCode: { readonly F12: number };
  readonly editor: {
    createModel(value: string, language: string, uri: MonacoUri): TextModel;
    createDiffEditor(host: HTMLElement, options: Readonly<Record<string, unknown>>): DiffEditor;
    create(host: HTMLElement, options: Readonly<Record<string, unknown>>): CodeEditor;
  };
}

export interface DiffIdentity {
  readonly repositorySessionId: string;
  readonly requestId: string;
}

const baseEditorOptions = {
  readOnly: true,
  theme: "vs-dark",
  automaticLayout: true,
  fontFamily: "Geist Variable, Cascadia Code, Consolas, monospace",
  fontSize: 14,
  lineHeight: 22,
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  accessibilitySupport: "on",
} as const;

export class MonacoDiffAdapter {
  private resources: readonly Disposable[] = [];
  /** The editor holding the reviewed revision, which navigation acts on. */
  private reviewEditor: CodeEditor | undefined;

  constructor(private readonly monaco: MonacoApi) {}

  show(
    host: HTMLElement,
    identity: DiffIdentity,
    file: TextCompositeFile,
    hooks: DiffViewHooks = {},
  ): void {
    this.dispose();
    this.resources = file.status === "added"
      ? this.createAddedFileView(host, identity, file, hooks)
      : this.createComparisonView(host, identity, file, hooks);
  }

  /**
   * Shows one revision of a file that is not part of the selected result, such as
   * a declaration a navigation reached outside the selection. There is nothing to
   * compare it against, so it is shown as a single document.
   */
  showDocument(
    host: HTMLElement,
    identity: DiffIdentity,
    path: string,
    contents: string,
    hooks: DiffViewHooks = {},
  ): void {
    this.dispose();
    let model: TextModel | undefined;
    let editor: CodeEditor | undefined;
    try {
      model = this.monaco.editor.createModel(
        contents,
        languageForPath(path),
        this.monaco.Uri.parse(modelUri(identity, path, "base")),
      );
      editor = this.monaco.editor.create(host, {
        ...baseEditorOptions,
        ariaLabel: "Read-only file outside the selected result",
      });
      editor.setModel(model);
      this.reviewEditor = editor;
      this.resources = [...this.attachSymbolHooks(editor, hooks), editor, model];
    } catch (error) {
      editor?.dispose();
      model?.dispose();
      this.reviewEditor = undefined;
      throw error;
    }
  }

  /** Puts a line in view and on the cursor, so the keyboard continues from there. */
  reveal(line: number): void {
    const editor = this.reviewEditor;
    if (editor === undefined || line < 1) {
      return;
    }
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }

  dispose(): void {
    for (const resource of this.resources) {
      resource.dispose();
    }
    this.resources = [];
    this.reviewEditor = undefined;
  }

  /**
   * Ctrl+Click and F12 ask for a declaration, Shift+F12 for references. Only the
   * reviewed revision is wired: the base side of a diff shows contents the
   * selection has already changed, so a search from there would answer about a
   * revision the user is not reviewing.
   */
  private attachSymbolHooks(
    editor: CodeEditor,
    hooks: DiffViewHooks,
  ): readonly Disposable[] {
    const onSymbol = hooks.onSymbol;
    if (onSymbol === undefined) {
      return [];
    }
    return [
      editor.onKeyDown((event) => {
        if (event.keyCode !== this.monaco.KeyCode.F12) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        requestSymbolAt(editor, editor.getPosition(), event.shiftKey ? "references" : "definition", onSymbol);
      }),
      editor.onMouseDown((event) => {
        if (!event.event.leftButton || !(event.event.ctrlKey || event.event.metaKey)) {
          return;
        }
        requestSymbolAt(editor, event.target.position, "definition", onSymbol);
      }),
    ];
  }

  /**
   * An added file has no base revision, so its whole content is shown once and
   * marked as added instead of being compared against an empty document.
   */
  private createAddedFileView(
    host: HTMLElement,
    identity: DiffIdentity,
    file: Extract<TextCompositeFile, { status: "added" }>,
    hooks: DiffViewHooks,
  ): readonly Disposable[] {
    let model: TextModel | undefined;
    let editor: CodeEditor | undefined;
    try {
      model = this.createModel(identity, file, "result", file.afterContent);
      editor = this.monaco.editor.create(host, {
        ...baseEditorOptions,
        renderLineHighlight: "none",
        ariaLabel: "Read-only contents of a file added by the selected result",
      });
      editor.setModel(model);
      editor.createDecorationsCollection([addedLineDecoration(model.getLineCount())]);
      this.reviewEditor = editor;
      return [...this.attachSymbolHooks(editor, hooks), editor, model];
    } catch (error) {
      editor?.dispose();
      model?.dispose();
      this.reviewEditor = undefined;
      throw error;
    }
  }

  private createComparisonView(
    host: HTMLElement,
    identity: DiffIdentity,
    file: Exclude<TextCompositeFile, { status: "added" }>,
    hooks: DiffViewHooks,
  ): readonly Disposable[] {
    let originalModel: TextModel | undefined;
    let resultModel: TextModel | undefined;
    let editor: DiffEditor | undefined;
    try {
      originalModel = this.createModel(identity, file, "original", file.beforeContent);
      resultModel = this.createModel(
        identity,
        file,
        "result",
        file.afterContent ?? "",
      );
      editor = this.monaco.editor.createDiffEditor(host, {
        ...baseEditorOptions,
        originalEditable: false,
        renderSideBySide: true,
        renderIndicators: true,
        // Lets the user drag the divider between the base and the result.
        enableSplitViewResizing: true,
        diffAlgorithm: "advanced",
        ariaLabel: "Read-only diff between base and selected result",
      });
      editor.setModel({ original: originalModel, modified: resultModel });
      const modified = editor.getModifiedEditor();
      this.reviewEditor = modified;
      return [
        ...this.attachSymbolHooks(modified, hooks),
        editor,
        originalModel,
        resultModel,
      ];
    } catch (error) {
      editor?.dispose();
      originalModel?.dispose();
      resultModel?.dispose();
      this.reviewEditor = undefined;
      throw error;
    }
  }

  private createModel(
    identity: DiffIdentity,
    file: TextCompositeFile,
    side: "original" | "result",
    value: string,
  ): TextModel {
    return this.monaco.editor.createModel(
      value,
      languageForPath(file.path),
      this.monaco.Uri.parse(modelUri(identity, file.path, side)),
    );
  }
}

/** Reads the identifier at a position and asks for it, or does nothing. */
function requestSymbolAt(
  editor: CodeEditor,
  position: EditorPosition | null,
  mode: SymbolRequestMode,
  onSymbol: SymbolRequestHandler,
): void {
  const model = editor.getModel();
  if (model === null || position === null) {
    return;
  }
  const found = symbolAt(model.getLineContent(position.lineNumber), position.column);
  if (found !== null) {
    onSymbol(found.name, mode);
  }
}

function addedLineDecoration(lineCount: number): LineDecoration {
  return {
    range: {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: Math.max(lineCount, 1),
      endColumn: 1,
    },
    options: {
      isWholeLine: true,
      className: ADDED_LINE_CLASS_NAME,
      marginClassName: ADDED_LINE_CLASS_NAME,
    },
  };
}

function modelUri(
  identity: DiffIdentity,
  path: string,
  side: "original" | "result" | "base",
): string {
  return `prettifer-diff://${encodeURIComponent(identity.repositorySessionId)}/${encodeURIComponent(identity.requestId)}/${side}?path=${encodeURIComponent(path)}`;
}

function languageForPath(path: string): string {
  const extension = path.toLocaleLowerCase().split(".").at(-1);
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "java":
      return "java";
    case "c":
    case "h":
    case "cc":
    case "cpp":
    case "cxx":
    case "hpp":
    case "hh":
    case "hxx":
      return "cpp";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
      return "markdown";
    case undefined:
    default:
      return "plaintext";
  }
}
