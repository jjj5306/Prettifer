import type { CompositeDiffResultDto } from "../../shared/index.js";
import { usageAt, type SymbolUsage } from "../../../symbols/definition-choice.js";
import { symbolAt } from "../../../symbols/symbol-at.js";

type CompositeFile = CompositeDiffResultDto["files"][number];
type TextCompositeFile = Exclude<CompositeFile, { binary: true }>;

/** Monaco decoration class that paints an added line, styled in DiffPane.module.css. */
export const ADDED_LINE_CLASS_NAME = "prettifer-added-line";

/** Marks the identifier a modifier-click would follow. */
export const SYMBOL_LINK_CLASS_NAME = "prettifer-symbol-link";

/** Marks the line a navigation arrived at. */
export const TARGET_LINE_CLASS_NAME = "prettifer-target-line";

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

interface EditorModifierEvent {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

interface EditorKeyboardEvent extends EditorModifierEvent {
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

/** How a comparison is laid out. Inline runs deletions and additions together. */
export type DiffView = "sideBySide" | "inline";

/** What the user asked of the symbol under the cursor. */
export type SymbolRequestMode = "definition" | "references";

export type SymbolRequestHandler = (
  symbol: string,
  mode: SymbolRequestMode,
  /** What the place the symbol was picked from says about it. */
  usage: SymbolUsage,
) => void;

export interface DiffViewHooks {
  readonly onSymbol?: SymbolRequestHandler;
  /** Layout of a comparison, side by side unless a view is given. */
  readonly view?: DiffView;
}

interface DiffEditor extends Disposable {
  setModel(model: {
    readonly original: TextModel;
    readonly modified: TextModel;
  }): void;
  getModifiedEditor(): CodeEditor;
  /** Changes options in place, keeping the models and the scroll position. */
  updateOptions(options: { readonly renderSideBySide: boolean }): void;
}

interface DecorationRange {
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

interface LineDecoration {
  readonly range: DecorationRange;
  readonly options: {
    readonly isWholeLine: boolean;
    readonly className: string;
    readonly marginClassName: string;
  };
}

/** A decoration over part of one line, used to mark an identifier. */
interface InlineDecoration {
  readonly range: DecorationRange;
  readonly options: { readonly inlineClassName: string };
}

/**
 * The handle Monaco returns for a set of decorations. Holding it and replacing
 * its contents is what keeps one mark on screen instead of a growing pile.
 */
interface DecorationsCollection {
  set(decorations: readonly (LineDecoration | InlineDecoration)[]): void;
  clear(): void;
}

interface CodeEditor extends Disposable {
  setModel(model: TextModel): void;
  createDecorationsCollection(
    decorations: readonly (LineDecoration | InlineDecoration)[],
  ): DecorationsCollection;
  getModel(): TextModel | null;
  getPosition(): EditorPosition | null;
  setPosition(position: EditorPosition): void;
  revealLineInCenter(lineNumber: number): void;
  onKeyDown(listener: (event: EditorKeyboardEvent) => void): Disposable;
  onKeyUp(listener: (event: EditorKeyboardEvent) => void): Disposable;
  onMouseDown(listener: (event: EditorMouseEvent) => void): Disposable;
  onMouseMove(listener: (event: EditorMouseEvent) => void): Disposable;
  onMouseLeave(listener: () => void): Disposable;
  getScrollTop(): number;
  getScrollLeft(): number;
  setScrollPosition(position: { readonly scrollTop: number; readonly scrollLeft: number }): void;
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

interface MonacoDiffViewState {
  readonly reviewed: Readonly<{
    position: EditorPosition | null;
    scrollTop: number;
    scrollLeft: number;
  }> | null;
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
  /** One collection each, replaced in place so marks never pile up. */
  private linkMark: DecorationsCollection | undefined;
  private targetMark: DecorationsCollection | undefined;
  /** Where the pointer last was, so a modifier press alone can mark a symbol. */
  private hoverPosition: EditorPosition | null = null;
  /** Held so a view change updates options instead of rebuilding the editor. */
  private comparisonEditor: DiffEditor | undefined;

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
      this.createMarks(editor);
      this.resources = [...this.attachSymbolHooks(host, editor, hooks), editor, model];
    } catch (error) {
      editor?.dispose();
      model?.dispose();
      this.reviewEditor = undefined;
      throw error;
    }
  }

  /**
   * Puts a position in view, on the cursor and under a mark.
   *
   * The column matters: a navigation to a member declaration should land on the
   * member, not at the start of its line. The mark stays until the next reveal,
   * so the arrival is still visible after scrolling away and back.
   */
  reveal(line: number, column = 1): void {
    const editor = this.reviewEditor;
    if (editor === undefined || line < 1) {
      return;
    }
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: Math.max(column, 1) });
    this.targetMark?.set([targetLineDecoration(line)]);
  }

  dispose(): void {
    for (const resource of this.resources) {
      resource.dispose();
    }
    this.resources = [];
    this.reviewEditor = undefined;
    this.comparisonEditor = undefined;
    this.linkMark = undefined;
    this.targetMark = undefined;
    this.hoverPosition = null;
  }

  /**
   * Lays the comparison out again without rebuilding it. Rebuilding would throw
   * away the scroll position, which is the one thing a reader must not lose when
   * they only asked for a different arrangement of the same content.
   *
   * A view with nothing to compare against ignores this.
   */
  setView(view: DiffView): void {
    this.comparisonEditor?.updateOptions({ renderSideBySide: view !== "inline" });
  }

  /** Captures cursor, selection, folding, and scroll state before a history review replaces the editor. */
  saveViewState(): object | null {
    const state: MonacoDiffViewState = {
      reviewed: this.reviewEditor === undefined
        ? null
        : {
            position: this.reviewEditor.getPosition(),
            scrollTop: this.reviewEditor.getScrollTop(),
            scrollLeft: this.reviewEditor.getScrollLeft(),
          },
    };
    return state.reviewed === null ? null : state;
  }

  /** Restores the exact reading position when the selected result is shown again. */
  restoreViewState(state: object): void {
    const snapshot = state as Partial<MonacoDiffViewState>;
    if (snapshot.reviewed !== null && snapshot.reviewed !== undefined && this.reviewEditor !== undefined) {
      this.reviewEditor.setScrollPosition({
        scrollTop: snapshot.reviewed.scrollTop,
        scrollLeft: snapshot.reviewed.scrollLeft,
      });
      if (snapshot.reviewed.position !== null) {
        this.reviewEditor.setPosition(snapshot.reviewed.position);
      }
    }
  }

  /**
   * Ctrl+Click and F12 ask for a declaration, Shift+F12 for references. Only the
   * reviewed revision is wired: the base side of a diff shows contents the
   * selection has already changed, so a search from there would answer about a
   * revision the user is not reviewing.
   */
  private attachSymbolHooks(
    host: HTMLElement,
    editor: CodeEditor,
    hooks: DiffViewHooks,
  ): readonly Disposable[] {
    const onSymbol = hooks.onSymbol;
    if (onSymbol === undefined) {
      return [];
    }
    return [
      // Watched on the document, not the editor: the mark has to appear and go
      // away with the modifier whether or not the editor holds keyboard focus.
      ...this.watchModifier(host, editor),
      editor.onKeyDown((event) => {
        this.markLinkTarget(editor, event);
        if (event.keyCode !== this.monaco.KeyCode.F12) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        requestSymbolAt(editor, editor.getPosition(), event.shiftKey ? "references" : "definition", onSymbol);
      }),
      editor.onKeyUp((event) => { this.markLinkTarget(editor, event); }),
      editor.onMouseMove((event) => {
        this.hoverPosition = event.target.position;
        this.markLinkTarget(editor, event.event);
      }),
      // A pointer that has left the editor is not over any identifier.
      editor.onMouseLeave(() => {
        this.hoverPosition = null;
        this.linkMark?.clear();
      }),
      editor.onMouseDown((event) => {
        if (!event.event.leftButton || !(event.event.ctrlKey || event.event.metaKey)) {
          return;
        }
        requestSymbolAt(editor, event.target.position, "definition", onSymbol);
      }),
    ];
  }

  /** Follows the modifier on the document, so focus never decides the mark. */
  private watchModifier(host: HTMLElement, editor: CodeEditor): readonly Disposable[] {
    const owner = host.ownerDocument;
    const onModifier = (event: KeyboardEvent): void => {
      this.markLinkTarget(editor, event);
    };
    owner.addEventListener("keydown", onModifier);
    owner.addEventListener("keyup", onModifier);
    return [{
      dispose: () => {
        owner.removeEventListener("keydown", onModifier);
        owner.removeEventListener("keyup", onModifier);
      },
    }];
  }

  /**
   * Marks the identifier a modifier-click would follow, using the same lookup as
   * the click itself so the mark can never name a different symbol.
   */
  private markLinkTarget(editor: CodeEditor, modifiers: EditorModifierEvent): void {
    const held = modifiers.ctrlKey || modifiers.metaKey;
    const position = this.hoverPosition;
    const found = held && position !== null
      ? symbolAtPosition(editor, position)
      : null;
    if (found === null || position === null) {
      this.linkMark?.clear();
      return;
    }
    this.linkMark?.set([{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: found.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: found.endColumn,
      },
      options: { inlineClassName: SYMBOL_LINK_CLASS_NAME },
    }]);
  }

  /** Creates the two mark collections on whichever editor holds the review. */
  private createMarks(editor: CodeEditor): void {
    this.linkMark = editor.createDecorationsCollection([]);
    this.targetMark = editor.createDecorationsCollection([]);
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
      this.createMarks(editor);
      return [...this.attachSymbolHooks(host, editor, hooks), editor, model];
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
        renderSideBySide: hooks.view !== "inline",
        renderIndicators: true,
        // Lets the user drag the divider between the base and the result.
        enableSplitViewResizing: true,
        diffAlgorithm: "advanced",
        ariaLabel: "Read-only diff between base and selected result",
      });
      editor.setModel({ original: originalModel, modified: resultModel });
      const modified = editor.getModifiedEditor();
      this.reviewEditor = modified;
      this.comparisonEditor = editor;
      this.createMarks(modified);
      return [
        ...this.attachSymbolHooks(host, modified, hooks),
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
  if (position === null) {
    return;
  }
  const found = symbolAtPosition(editor, position);
  const line = editor.getModel()?.getLineContent(position.lineNumber) ?? "";
  if (found !== null) {
    onSymbol(found.name, mode, usageAt(line, found.startColumn));
  }
}

/** The one place a position becomes an identifier, shared by clicks and marks. */
function symbolAtPosition(
  editor: CodeEditor,
  position: EditorPosition,
): ReturnType<typeof symbolAt> {
  const model = editor.getModel();
  return model === null
    ? null
    : symbolAt(model.getLineContent(position.lineNumber), position.column);
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

function targetLineDecoration(line: number): LineDecoration {
  return {
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1,
    },
    options: {
      isWholeLine: true,
      className: TARGET_LINE_CLASS_NAME,
      marginClassName: TARGET_LINE_CLASS_NAME,
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
