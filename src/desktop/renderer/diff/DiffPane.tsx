import { useEffect, useRef, useState } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import type { ExternalFileState } from "../state/app-state.js";
import {
  MonacoDiffAdapter,
  type DiffIdentity,
  type DiffViewHooks,
  type MonacoApi,
  type SymbolRequestMode,
} from "./MonacoDiffAdapter.js";
import styles from "./DiffPane.module.css";

type CompositeFile = CompositeDiffResultDto["files"][number];
type TextCompositeFile = Exclude<CompositeFile, { binary: true }>;

interface DiffAdapter {
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
  reveal(line: number): void;
  dispose(): void;
}

type CompositeProblemFile = CompositeDiffResultDto["problemFiles"][number];

interface DiffPaneProps {
  readonly identity: DiffIdentity;
  readonly file: CompositeFile | null;
  readonly problem?: CompositeProblemFile | null;
  /** A file a navigation reached outside the selected result. */
  readonly externalFile?: ExternalFileState;
  /** Line a navigation asked to show, 1-based. */
  readonly revealLine?: number | null;
  readonly onSymbol?: (symbol: string, mode: SymbolRequestMode) => void;
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
  revealLine = null,
  onSymbol,
  loadAdapter = loadMonacoAdapter,
}: DiffPaneProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<DiffAdapter | null>(null);
  const [retry, setRetry] = useState(0);
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
      const hooks = onSymbol === undefined ? {} : { onSymbol };
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
  }, [currentKey, loadAdapter, onSymbol, repositorySessionId, requestId, retry]);

  /*
   * Revealing waits for the editor to exist, and runs again when a navigation
   * asks for another line of the file that is already open.
   */
  useEffect(() => {
    if (revealLine === null || outcome?.key !== currentKey || outcome.status !== "ready") {
      return;
    }
    adapterRef.current?.reveal(revealLine);
  }, [currentKey, outcome, revealLine]);

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
    const view = targetView(target);
    return (
      <section
        id="diff-review"
        className={styles.panel}
        aria-labelledby="diff-heading"
        tabIndex={-1}
      >
        <div className={styles.headingRow}>
          <h2 id="diff-heading">{view.heading}</h2>
          <p>{view.description}</p>
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
          aria-label={`${view.editorLabel}: ${view.path} · ${view.editorContext}`}
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
  readonly description: string;
  readonly editorLabel: string;
  readonly editorContext: string;
}

function targetView(target: ReviewTarget): ReviewView {
  if (target.kind === "document") {
    return {
      heading: "Outside the Selected Result",
      path: target.path,
      description: "Comparison base · this file is not part of the selection",
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
      description: "New file · every line is part of the selected result",
      editorLabel: "Read-only added file",
      editorContext: "full contents added by the selected result",
    };
  }
  return {
    heading: "Side-by-side Diff",
    description: "Base on the left · selected result on the right",
    editorLabel: "Read-only diff",
    editorContext: "base and selected result",
  };
}

async function loadMonacoAdapter(): Promise<DiffAdapter> {
  const monaco = await import("monaco-editor");
  return new MonacoDiffAdapter(monaco as unknown as MonacoApi);
}
