import type { CompositeDiffResultDto } from "../../shared/index.js";

type CompositeFile = CompositeDiffResultDto["files"][number];

interface DisposableModel {
  dispose(): void;
}

interface DisposableDiffEditor {
  setModel(model: {
    readonly original: DisposableModel;
    readonly modified: DisposableModel;
  }): void;
  dispose(): void;
}

interface MonacoUri {
  readonly value?: string;
}

export interface MonacoApi {
  readonly Uri: {
    parse(value: string): MonacoUri;
  };
  readonly editor: {
    createModel(value: string, language: string, uri: MonacoUri): DisposableModel;
    createDiffEditor(host: HTMLElement, options: Readonly<Record<string, unknown>>): DisposableDiffEditor;
  };
}

export interface DiffIdentity {
  readonly repositorySessionId: string;
  readonly requestId: string;
}

export class MonacoDiffAdapter {
  private editor: DisposableDiffEditor | undefined;
  private originalModel: DisposableModel | undefined;
  private resultModel: DisposableModel | undefined;

  constructor(private readonly monaco: MonacoApi) {}

  show(host: HTMLElement, identity: DiffIdentity, file: CompositeFile): void {
    this.dispose();
    let originalModel: DisposableModel | undefined;
    let resultModel: DisposableModel | undefined;
    let editor: DisposableDiffEditor | undefined;
    try {
      const language = languageForPath(file.path);
      originalModel = this.monaco.editor.createModel(
        file.beforeContent ?? "",
        language,
        this.monaco.Uri.parse(modelUri(identity, file.path, "original")),
      );
      resultModel = this.monaco.editor.createModel(
        file.afterContent ?? "",
        language,
        this.monaco.Uri.parse(modelUri(identity, file.path, "result")),
      );
      editor = this.monaco.editor.createDiffEditor(host, {
        readOnly: true,
        theme: "vs-dark",
        originalEditable: false,
        automaticLayout: true,
        renderSideBySide: true,
        renderIndicators: true,
        accessibilitySupport: "on",
        ariaLabel: "원본과 통합 결과 읽기 전용 diff",
      });
      editor.setModel({ original: originalModel, modified: resultModel });
      this.originalModel = originalModel;
      this.resultModel = resultModel;
      this.editor = editor;
    } catch (error) {
      editor?.dispose();
      originalModel?.dispose();
      resultModel?.dispose();
      throw error;
    }
  }

  dispose(): void {
    this.editor?.dispose();
    this.originalModel?.dispose();
    this.resultModel?.dispose();
    this.editor = undefined;
    this.originalModel = undefined;
    this.resultModel = undefined;
  }
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
