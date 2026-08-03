import { useCallback, useEffect, useRef, useState } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import type { ExternalFileState, ReviewPosition } from "../state/app-state.js";
import {
  MonacoDiffAdapter,
  type DiffIdentity,
  type DiffView,
  type DiffViewHooks,
  type MonacoApi,
  type SymbolRequestHandler,
} from "./MonacoDiffAdapter.js";
import styles from "./DiffPane.module.css";

type CompositeFile = CompositeDiffResultDto["files"][number];
type TextCompositeFile = Exclude<CompositeFile, { binary: true }>;

interface DiffAdapter {
  setView(view: DiffView): void;
  show(
    host: HTMLElement,
    identity: DiffIdentity,
    file: TextCompositeFile,
    hooks?: DiffViewHooks,
  ): void;
  showDocument(
    host: HTMLElement,
    identity: DiffIdentity,
    path: string,
    contents: string,
    hooks?: DiffViewHooks,
  ): void;
  reveal(line: number, column?: number): void;
  dispose(): void;
}

type CompositeProblemFile = CompositeDiffResultDto["problemFiles"][number];

interface DiffPaneProps {
  readonly identity: DiffIdentity;
  readonly file: CompositeFile | null;
  readonly problem?: CompositeProblemFile | null;
  /** A file a navigation reached outside the selected result. */
  readonly externalFile?: ExternalFileState;
  /** Position a navigation asked to show. */
  readonly reveal?: ReviewPosition | null;
  readonly onSymbol?: SymbolRequestHandler;
  readonly loadAdapter?: () => Promise<DiffAdapter>;
}

type LoadOutcome =
  | Readonly<{ key: string; status: "ready" }>
  | Readonly<{ key: string; status: "error" }>;

/** What the review area shows, once problems and binaries are ruled out. */
type ReviewTarget =
  | Readonly<{ kind: "diff"; file: TextCompositeFile }>
  | Readonly<{ kind: "document"; path: string; contents: string }>;

export const DiffPane = ({
  identity,
  file,
  problem = null,
  externalFile = { status: "idle" },
  reveal = null,
  onSymbol,
  loadAdapter = loadMonacoAdapter,
}: DiffPaneProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<DiffAdapter | null>(null);
  /*
   * The editor is told about symbol requests through a stable function that reads
   * the current handler. Passing the handler itself would tie the editor's life to
   * the identity of a callback the parent rebuilds on every render, and rebuilding
   * the editor throws away the scroll position (issue #61).
   */
  const onSymbolRef = useRef(onSymbol);
  useEffect(() => { onSymbolRef.current = onSymbol; }, [onSymbol]);
  const forwardSymbol = useCallback<SymbolRequestHandler>((symbol, mode, usage) => {
    onSymbolRef.current?.(symbol, mode, usage);
  }, []);
  const wantsSymbols = onSymbol !== undefined;
  const [retry, setRetry] = useState(0);
  /*
   * The chosen layout lives here, beside the review it belongs to, the same way
   * the changed-file panel keeps its own Tree or List choice.
   */
  const [view, setView] = useState<DiffView>("sideBySide");
  /*
   * Read when an editor is created, so the current layout applies to a file that
   * opens later. It is deliberately not an effect dependency: changing the view
   * updates options on the editor that already exists.
   */
  const viewRef = useRef(view);
  const [outcome, setOutcome] = useState<LoadOutcome | null>(null);
  const { repositorySessionId, requestId } = identity;
  // A file outside the result replaces the diff, so it decides the target first.
  const target = reviewTarget(file, problem, externalFile);
  const currentKey = target === null
    ? "empty"
    : target.kind === "document"
      ? `base:${repositorySessionId}:${target.path}`
      : `${repositorySessionId}:${requestId}:${target.file.path}:${String(retry)}`;

  useEffect(() => {
    if (target === null) {
      return undefined;
    }
    let active = true;
    let adapter: DiffAdapter | undefined;
    void loadAdapter().then((loadedAdapter) => {
      if (!active) {
        loadedAdapter.dispose();
        return;
      }
      const host = hostRef.current;
      if (host === null) {
        loadedAdapter.dispose();
        return;
      }
      adapter = loadedAdapter;
      adapterRef.current = loadedAdapter;
      const hooks = wantsSymbols
        ? { onSymbol: forwardSymbol, view: viewRef.current }
        : { view: viewRef.current };
      const identityForModel = { repositorySessionId, requestId };
      if (target.kind === "document") {
        loadedAdapter.showDocument(
          host,
          identityForModel,
          target.path,
          target.contents,
          hooks,
        );
      } else {
        loadedAdapter.show(host, identityForModel, target.file, hooks);
      }
      setOutcome({ key: currentKey, status: "ready" });
      if (retry > 0) {
        host.focus();
      }
    }).catch(() => {
      if (active) {
        adapter?.dispose();
        adapter = undefined;
        adapterRef.current = null;
        setOutcome({ key: currentKey, status: "error" });
      }
    });
    return () => {
      active = false;
      adapter?.dispose();
      if (adapterRef.current === adapter) {
        adapterRef.current = null;
      }
    };
    // `target` is rebuilt on every render, so `currentKey` stands for it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, forwardSymbol, loadAdapter, repositorySessionId, requestId, retry, wantsSymbols]);

  /*
   * Revealing waits for the editor to exist, and runs again when a navigation
   * asks for another line of the file that is already open.
   */
  useEffect(() => {
    if (reveal === null || outcome?.key !== currentKey || outcome.status !== "ready") {
      return;
    }
    adapterRef.current?.reveal(reveal.line, reveal.column);
  }, [currentKey, outcome, reveal]);

  // Laying the comparison out again keeps the editor, and with it the position.
  useEffect(() => {
    viewRef.current = view;
    adapterRef.current?.setView(view);
  }, [view]);

  if (externalFile.status === "loading") {
    return (
      <ReviewPanel heading="Outside the Selected Result" subheading={externalFile.path}>
        <p aria-live="polite">Opening the file at the comparison base…</p>
      </ReviewPanel>
    );
  }

  if (externalFile.status === "error") {
    return (
      <ReviewPanel heading="Outside the Selected Result" subheading={externalFile.path}>
        <div className={styles.problemState} role="alert">
          <strong>This file could not be opened</strong>
          <p>{externalFile.diagnostic.message}</p>
          <p>{externalFile.diagnostic.nextAction}</p>
        </div>
      </ReviewPanel>
    );
  }

  if (target !== null) {
    const status = outcome?.key === currentKey ? outcome.status : "loading";
    const shown = targetView(target);
    // Only a comparison has two sides to arrange.
    const comparable = target.kind === "diff" && target.file.status !== "added";
    return (
      <section
        id="diff-review"
        className={styles.panel}
        aria-labelledby="diff-heading"
        tabIndex={-1}
      >
        <div className={styles.headingRow}>
          <h2 id="diff-heading">{shown.heading}</h2>
          <ReviewedPath path={shown.path} />
          {comparable ? (
            <DiffViewToggle view={view} onChange={setView} />
          ) : null}
        </div>
        {status === "loading" ? (
          <p aria-live="polite">Loading diff editor…</p>
        ) : null}
        {status === "error" ? (
          <div role="alert" className={styles.error}>
            <p>The diff editor could not open. Retry the current file.</p>
            <button type="button" onClick={() => { setRetry((current) => current + 1); }}>
              Retry Diff
            </button>
          </div>
        ) : null}
        <div
          ref={hostRef}
          className={styles.editorHost}
          role="textbox"
          aria-multiline="true"
          aria-readonly="true"
          tabIndex={0}
          aria-label={`${shown.editorLabel}: ${shown.path} · ${shown.editorContext}`}
        />
      </section>
    );
  }

  if (problem !== null) {
    return (
      <ReviewPanel heading="Problem File" subheading={problem.path}>
        <div className={styles.problemState} role="alert">
          <strong>This file needs a content choice</strong>
          <p>
            Applying <code>{problem.commit.slice(0, 7)}</code> to this file could
            not be completed without choosing between different contents, so the
            file was left at the comparison base.
          </p>
          <p>{problem.nextAction}</p>
        </div>
      </ReviewPanel>
    );
  }

  if (file?.binary === true) {
    return (
      <ReviewPanel heading={reviewView(file).heading} subheading={file.path}>
        <div className={styles.binaryState}>
          <strong>Binary file</strong>
          <p>Text diff is not available for this file. Its binary contents were not loaded.</p>
        </div>
      </ReviewPanel>
    );
  }

  return (
    <section
      id="diff-review"
      className={styles.panel}
      aria-labelledby="diff-heading"
      tabIndex={-1}
    >
      <h2 id="diff-heading">Side-by-side Diff</h2>
      <p>Select a changed file to review.</p>
    </section>
  );
};

/** Chooses how a comparison is laid out, beside the file it belongs to. */
const DiffViewToggle = ({
  view,
  onChange,
}: {
  readonly view: DiffView;
  readonly onChange: (view: DiffView) => void;
}) => (
  <div className={styles.viewToggle} role="group" aria-label="Diff layout">
    <button
      type="button"
      title="Side-by-side"
      aria-label="Side-by-side"
      aria-pressed={view === "sideBySide"}
      className={view === "sideBySide" ? styles.activeView : undefined}
      onClick={() => { onChange("sideBySide"); }}
    >
      <LayoutIcon view="sideBySide" />
    </button>
    <button
      type="button"
      title="Inline"
      aria-label="Inline"
      aria-pressed={view === "inline"}
      className={view === "inline" ? styles.activeView : undefined}
      onClick={() => { onChange("inline"); }}
    >
      <LayoutIcon view="inline" />
    </button>
  </div>
);

const LayoutIcon = ({ view }: Readonly<{ view: DiffView }>) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 16 16"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {view === "sideBySide" ? (
      <>
        <path d="M2.5 3h4.5v10H2.5zM9 3h4.5v10H9z" />
      </>
    ) : (
      <>
        <path d="M2.5 3h11M2.5 6.5h11M2.5 10h11M2.5 13.5h11" />
      </>
    )}
  </svg>
);

/**
 * The path of the file under review. Symbol navigation changes it under the user,
 * so the file name never truncates: only the directories above it give way when
 * the panel is narrow.
 */
const ReviewedPath = ({ path }: { readonly path: string }) => {
  const separator = path.lastIndexOf("/");
  const directory = separator < 0 ? "" : path.slice(0, separator + 1);
  const name = separator < 0 ? path : path.slice(separator + 1);
  return (
    <p className={styles.reviewedPath} title={path}>
      <span className={styles.pathDirectory}>{directory}</span>
      <span className={styles.pathName}>{name}</span>
    </p>
  );
};

/** The panel frame shared by every state that is not an editor. */
const ReviewPanel = ({
  heading,
  subheading,
  children,
}: {
  readonly heading: string;
  readonly subheading: string;
  readonly children: React.ReactNode;
}) => (
  <section
    id="diff-review"
    className={styles.panel}
    aria-labelledby="diff-heading"
    tabIndex={-1}
  >
    <div className={styles.headingRow}>
      <h2 id="diff-heading">{heading}</h2>
      <p>{subheading}</p>
    </div>
    {children}
  </section>
);

function reviewTarget(
  file: CompositeFile | null,
  problem: CompositeProblemFile | null,
  externalFile: ExternalFileState,
): ReviewTarget | null {
  if (externalFile.status === "ready") {
    return { kind: "document", path: externalFile.path, contents: externalFile.contents };
  }
  if (externalFile.status !== "idle" || file === null || file.binary === true || problem !== null) {
    return null;
  }
  return { kind: "diff", file };
}

interface ReviewView {
  readonly heading: string;
  readonly path: string;
  readonly editorLabel: string;
  /** Says what the editor holds; kept in the accessible name, not on screen. */
  readonly editorContext: string;
}

function targetView(target: ReviewTarget): ReviewView {
  if (target.kind === "document") {
    return {
      heading: "Outside the Selected Result",
      path: target.path,
      editorLabel: "Read-only file outside the selected result",
      editorContext: "contents at the comparison base",
    };
  }
  return { ...reviewView(target.file), path: target.file.path };
}

/** An added file has no base revision, so it is reviewed as one added document. */
function reviewView(file: CompositeFile): Omit<ReviewView, "path"> {
  if (file.status === "added") {
    return {
      heading: "Added File",
      editorLabel: "Read-only added file",
      editorContext: "full contents added by the selected result",
    };
  }
  return {
    heading: "Side-by-side Diff",
    editorLabel: "Read-only diff",
    editorContext: "base and selected result",
  };
}

async function loadMonacoAdapter(): Promise<DiffAdapter> {
  const monaco = await import("monaco-editor");
  return new MonacoDiffAdapter(monaco as unknown as MonacoApi);
}
