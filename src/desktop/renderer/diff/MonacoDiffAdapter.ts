import type { CompositeDiffResultDto } from "../../shared/index.js";

type CompositeFile = CompositeDiffResultDto["files"][number];
type TextCompositeFile = Exclude<CompositeFile, { binary: true }>;

/** Monaco decoration class that paints an added line, styled in DiffPane.module.css. */
export const ADDED_LINE_CLASS_NAME = "prettifer-added-line";

interface Disposable {
  dispose(): void;
}

interface TextModel extends Disposable {
  getLineCount(): number;
}

interface DiffEditor extends Disposable {
  setModel(model: {
    readonly original: TextModel;
    readonly modified: TextModel;
  }): void;
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
}

interface MonacoUri {
  readonly value?: string;
}

export interface MonacoApi {
  readonly Uri: {
    parse(value: string): MonacoUri;
  };
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

  constructor(private readonly monaco: MonacoApi) {}

  show(host: HTMLElement, identity: DiffIdentity, file: TextCompositeFile): void {
    this.dispose();
    this.resources = file.status === "added"
      ? this.createAddedFileView(host, identity, file)
      : this.createComparisonView(host, identity, file);
  }

  dispose(): void {
    for (const resource of this.resources) {
      resource.dispose();
    }
    this.resources = [];
  }

  /**
   * An added file has no base revision, so its whole content is shown once and
   * marked as added instead of being compared against an empty document.
   */
  private createAddedFileView(
    host: HTMLElement,
    identity: DiffIdentity,
    file: Extract<TextCompositeFile, { status: "added" }>,
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
      return [editor, model];
    } catch (error) {
      editor?.dispose();
      model?.dispose();
      throw error;
    }
  }

  private createComparisonView(
    host: HTMLElement,
    identity: DiffIdentity,
    file: Exclude<TextCompositeFile, { status: "added" }>,
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
      return [editor, originalModel, resultModel];
    } catch (error) {
      editor?.dispose();
      originalModel?.dispose();
      resultModel?.dispose();
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
  side: "original" | "result",
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
