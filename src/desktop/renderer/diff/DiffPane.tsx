import { useCallback, useEffect, useRef, useState } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import type {
  ExternalFileState,
  FileCommitState,
  ReviewPosition,
} from "../state/app-state.js";
import {
  MonacoDiffAdapter,
  type DiffIdentity,
  type DiffView,
  type DiffViewHooks,
  type MonacoApi,
  type SymbolRequestHandler,
} from "./MonacoDiffAdapter.js";
import { panelClass } from "../panel-class.js";
import styles from "./DiffPane.module.css";

/**
 * Names the review rather than its layout: side-by-side and inline are the
 * reader's choice in the toggle beside this heading, not what the panel is for.
 */
const COMPARISON_HEADING = "Differentia Codicis";
/** A change is only ever opened from the history list, so that is where it returns. */
const CLOSE_HISTORY_CHANGE_LABEL = "Back to File History";

/*
 * Where the reader was in the selected-result comparison, kept outside the
 * component: the file history takes this panel's place, and a position stored in
 * a ref would be gone by the time the reader comes back. The file history list
 * keeps its own scroll position the same way.
 */
const compositeViewStates = new Map<string, object>();

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
  saveViewState?(): object | null;
  restoreViewState?(state: object): void;
  dispose(): void;
}

type CompositeProblemFile = CompositeDiffResultDto["problemFiles"][number];

interface DiffPaneProps {
  /** True while the activity rail points at this region. */
  readonly isCurrentRegion: boolean;
  readonly identity: DiffIdentity;
  readonly file: CompositeFile | null;
  readonly problem?: CompositeProblemFile | null;
  /** A file a navigation reached outside the selected result. */
  readonly externalFile?: ExternalFileState;
  /** Position a navigation asked to show. */
  readonly reveal?: ReviewPosition | null;
  readonly fileCommit?: FileCommitState;
  readonly onCloseFileCommit?: () => void;
  readonly onSymbol?: SymbolRequestHandler;
  readonly loadAdapter?: () => Promise<DiffAdapter>;
}

type LoadOutcome =
  | Readonly<{ key: string; status: "ready" }>
  | Readonly<{ key: string; status: "error" }>;

/** What the review area shows, once problems and binaries are ruled out. */
type ReviewTarget =
  | Readonly<{ kind: "diff"; file: TextCompositeFile }>
  | Readonly<{
      kind: "history";
      file: TextCompositeFile;
      change: Extract<FileCommitState, { status: "ready" }>["change"];
    }>
  | Readonly<{ kind: "document"; path: string; contents: string }>;

export const DiffPane = ({
  identity,
  isCurrentRegion,
  file,
  problem = null,
  externalFile = { status: "idle" },
  reveal = null,
  fileCommit = { status: "idle" },
  onCloseFileCommit,
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
  const target = reviewTarget(file, problem, externalFile, fileCommit);
  const currentKey = target === null
    ? "empty"
    : target.kind === "document"
      ? `base:${repositorySessionId}:${target.path}`
      : target.kind === "history"
        ? `${repositorySessionId}:history:${target.change.commitId}:${target.file.path}:${String(retry)}`
        : `${repositorySessionId}:${requestId}:${target.file.path}:${String(retry)}`;
  const compositeViewKey = target?.kind === "diff"
    ? `${repositorySessionId}:${requestId}:${target.file.path}`
    : null;

  useEffect(() => {
    if (target === null) {
      return undefined;
    }
    let active = true;
    let adapter: DiffAdapter | undefined;
    const effectHost = hostRef.current;
    void loadAdapter().then((loadedAdapter) => {
      if (!active) {
        loadedAdapter.dispose();
        return;
      }
      if (effectHost === null) {
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
          effectHost,
          identityForModel,
          target.path,
          target.contents,
          hooks,
        );
      } else {
        loadedAdapter.show(effectHost, identityForModel, target.file, hooks);
      }
      const savedView = compositeViewKey === null
        ? undefined
        : compositeViewStates.get(compositeViewKey);
      if (target.kind === "diff" && savedView !== undefined) {
        loadedAdapter.restoreViewState?.(savedView);
      }
      setOutcome({ key: currentKey, status: "ready" });
      if (retry > 0) {
        effectHost.focus();
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
      if (target.kind === "diff" && compositeViewKey !== null) {
        const savedState = adapter?.saveViewState?.();
        if (savedState != null) {
          rememberCompositeView(repositorySessionId, compositeViewKey, savedState);
        }
      }
      adapter?.dispose();
      // Monaco owns every child it creates in the host. Clearing the disposed
      // tree lets a third view (result → history → result) mount reliably. (#14)
      effectHost?.replaceChildren();
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
      <ReviewPanel heading="Outside the Selected Result" subheading={externalFile.path} isCurrentRegion={isCurrentRegion}>
        <p aria-live="polite">Opening the file at the comparison base…</p>
      </ReviewPanel>
    );
  }

  if (fileCommit.status === "loading") {
    return (
      <ReviewPanel heading="File History Change" subheading={fileCommit.path} isCurrentRegion={isCurrentRegion} onEscape={onCloseFileCommit}>
        <p aria-live="polite">Loading the file change…</p>
      </ReviewPanel>
    );
  }

  if (fileCommit.status === "error") {
    return (
      <ReviewPanel heading="File History Change" subheading={fileCommit.path} isCurrentRegion={isCurrentRegion} onEscape={onCloseFileCommit}>
        <div className={styles.problemState} role="alert">
          <strong>This file change could not be opened</strong>
          <p>{fileCommit.diagnostic.message}</p>
          <p>{fileCommit.diagnostic.nextAction}</p>
          <button type="button" onClick={onCloseFileCommit}>{CLOSE_HISTORY_CHANGE_LABEL}</button>
        </div>
      </ReviewPanel>
    );
  }

  if (fileCommit.status === "ready" && fileCommit.change.binary) {
    const change = fileCommit.change;
    return (
      <ReviewPanel heading="Binary File History Change" subheading={change.path} isCurrentRegion={isCurrentRegion} onEscape={onCloseFileCommit}>
        <div className={styles.binaryState}>
          <strong>Binary content comparison is not available</strong>
          <p>{historyChangeSummary(change)}</p>
          <p>Compared with {parentLabel(change)}.</p>
          <p>Blob sizes: {sizeLabel(change.beforeSize)} → {sizeLabel(change.afterSize)}</p>
          <button type="button" onClick={onCloseFileCommit}>{CLOSE_HISTORY_CHANGE_LABEL}</button>
        </div>
      </ReviewPanel>
    );
  }

  if (externalFile.status === "error") {
    return (
      <ReviewPanel heading="Outside the Selected Result" subheading={externalFile.path} isCurrentRegion={isCurrentRegion}>
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
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
      <section
        id="diff-review"
        className={panelClass(styles.panel, isCurrentRegion)}
        aria-labelledby="diff-heading"
        tabIndex={-1}
        onKeyDown={(event) => {
          leaveOnEscape(event, target.kind === "history" ? onCloseFileCommit : undefined);
        }}
      >
        <div className={styles.headingRow}>
          <h2 id="diff-heading">{shown.heading}</h2>
          <ReviewedPath path={shown.path} />
          {target.kind === "history" ? (
            <button type="button" onClick={onCloseFileCommit}>{CLOSE_HISTORY_CHANGE_LABEL}</button>
          ) : null}
          {shown.rename === undefined ? null : <RenameNote rename={shown.rename} />}
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
      <ReviewPanel heading="Problem File" subheading={problem.path} isCurrentRegion={isCurrentRegion}>
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
      <ReviewPanel heading={reviewView(file).heading} subheading={file.path} isCurrentRegion={isCurrentRegion}>
        <div className={styles.binaryState}>
          <strong>Binary file</strong>
          <p>Text diff is not available for this file. Its binary contents were not loaded.</p>
          {file.status === "renamed" ? <RenameNote rename={file} /> : null}
        </div>
      </ReviewPanel>
    );
  }

  return (
    <section
      id="diff-review"
      className={panelClass(styles.panel, isCurrentRegion)}
      aria-labelledby="diff-heading"
      tabIndex={-1}
    >
      <h2 id="diff-heading">{COMPARISON_HEADING}</h2>
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
 * Keeps the position of the file just left, and drops the ones belonging to a
 * repository session that has ended: those can never be restored again.
 */
function rememberCompositeView(
  repositorySessionId: string,
  key: string,
  state: object,
): void {
  for (const stored of compositeViewStates.keys()) {
    if (!stored.startsWith(`${repositorySessionId}:`)) {
      compositeViewStates.delete(stored);
    }
  }
  compositeViewStates.set(key, state);
}

/**
 * Escape steps back from a file-history change to the list it was opened from.
 * A panel with no change to leave passes nothing and keeps the key.
 */
function leaveOnEscape(
  event: React.KeyboardEvent<HTMLElement>,
  onEscape: (() => void) | undefined,
): void {
  if (event.key === "Escape" && onEscape !== undefined) {
    event.preventDefault();
    onEscape();
  }
}

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
  isCurrentRegion,
  onEscape,
  children,
}: {
  readonly heading: string;
  readonly subheading: string;
  readonly isCurrentRegion: boolean;
  /** Set while the panel shows a file-history change, which Escape leaves. */
  readonly onEscape?: (() => void) | undefined;
  readonly children: React.ReactNode;
}) => (
  // The review region takes Escape while it stands in for the file history. (#99)
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  <section
    id="diff-review"
    className={panelClass(styles.panel, isCurrentRegion)}
    aria-labelledby="diff-heading"
    tabIndex={-1}
    onKeyDown={(event) => { leaveOnEscape(event, onEscape); }}
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
  fileCommit: FileCommitState,
): ReviewTarget | null {
  if (fileCommit.status === "ready" && !fileCommit.change.binary) {
    return {
      kind: "history",
      file: historyTextFile(fileCommit.change),
      change: fileCommit.change,
    };
  }
  if (fileCommit.status === "ready" && fileCommit.change.binary) {
    return null;
  }
  if (externalFile.status === "ready") {
    return { kind: "document", path: externalFile.path, contents: externalFile.contents };
  }
  if (externalFile.status !== "idle" || file === null || file.binary === true || problem !== null) {
    return null;
  }
  return { kind: "diff", file };
}

interface Rename {
  readonly previousPath: string;
  readonly similarity: number;
}

interface ReviewView {
  readonly heading: string;
  readonly path: string;
  readonly editorLabel: string;
  /** Says what the editor holds; kept in the accessible name, not on screen. */
  readonly editorContext: string;
  /** Present only for a file the selection moved. */
  readonly rename?: Rename;
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
  if (target.kind === "history") {
    return {
      ...reviewView(target.file),
      heading: "File History Change",
      path: target.file.path,
      editorLabel: "Read-only file history diff",
      editorContext: `commit ${target.change.commitId.slice(0, 7)} compared with ${parentLabel(target.change)}`,
      ...(target.file.status === "renamed"
        ? {
            rename: {
              previousPath: target.file.previousPath,
              similarity: target.file.similarity,
            },
          }
        : {}),
    };
  }
  const file = target.file;
  return {
    ...reviewView(file),
    path: file.path,
    ...(file.status === "renamed"
      ? { rename: { previousPath: file.previousPath, similarity: file.similarity } }
      : {}),
  };
}

function historyTextFile(
  change: Extract<Extract<FileCommitState, { status: "ready" }>["change"], { binary: false }>,
): TextCompositeFile {
  switch (change.status) {
    case "added":
      return { path: change.path, status: "added", beforeContent: null, afterContent: change.afterContent };
    case "modified":
      return { path: change.path, status: "modified", beforeContent: change.beforeContent, afterContent: change.afterContent };
    case "deleted":
      return { path: change.path, status: "deleted", beforeContent: change.beforeContent, afterContent: null };
    case "renamed":
      return {
        path: change.path,
        status: "renamed",
        previousPath: change.previousPath,
        similarity: change.similarity,
        beforeContent: change.beforeContent,
        afterContent: change.afterContent,
      };
  }
}

function parentLabel(change: Readonly<{ parentCommit: string | null; parentNumber: number | null }>): string {
  return change.parentCommit === null
    ? "the empty repository state"
    : `parent ${String(change.parentNumber ?? 1)} (${change.parentCommit.slice(0, 7)})`;
}

function historyChangeSummary(change: Readonly<{
  status: string;
  path: string;
  previousPath?: string | undefined;
}>): string {
  return change.status === "renamed" && change.previousPath !== undefined
    ? `Renamed ${change.previousPath} to ${change.path}.`
    : `${change.status[0]?.toUpperCase() ?? ""}${change.status.slice(1)} ${change.path}.`;
}

function sizeLabel(size: number | null): string {
  return size === null ? "none" : `${String(size)} bytes`;
}

/** An added file has no base revision, so it is reviewed as one added document. */
function reviewView(file: CompositeFile): Omit<ReviewView, "path" | "rename"> {
  if (file.status === "added") {
    return {
      heading: "Added File",
      editorLabel: "Read-only added file",
      editorContext: "full contents added by the selected result",
    };
  }
  if (file.status === "renamed") {
    // The left side is the file at the path it used to have, so the accessible
    // name says so: otherwise "base" reads as the base of the current path,
    // which holds nothing.
    return {
      heading: "Renamed File",
      editorLabel: "Read-only diff",
      editorContext: `base at ${file.previousPath} and selected result`,
    };
  }
  return {
    heading: COMPARISON_HEADING,
    editorLabel: "Read-only diff",
    editorContext: "base and selected result",
  };
}

/**
 * Where a moved file came from and how much of it Git matched to call the two
 * paths the same file. The percentage is the judgement the result rests on: 100
 * is a pure move, and anything less was moved and edited.
 */
const RenameNote = ({ rename }: { readonly rename: Rename }) => (
  <p className={styles.renameNote}>
    {"Renamed from "}
    <span className={styles.renamePath} title={rename.previousPath}>
      {rename.previousPath}
    </span>
    {` · ${String(rename.similarity)}% of the content matched`}
  </p>
);

async function loadMonacoAdapter(): Promise<DiffAdapter> {
  const monaco = await import("monaco-editor");
  return new MonacoDiffAdapter(monaco as unknown as MonacoApi);
}
