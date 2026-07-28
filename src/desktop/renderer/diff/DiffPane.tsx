import { useEffect, useRef, useState } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import {
  MonacoDiffAdapter,
  type DiffIdentity,
  type MonacoApi,
} from "./MonacoDiffAdapter.js";
import styles from "./DiffPane.module.css";

type CompositeFile = CompositeDiffResultDto["files"][number];
type TextCompositeFile = Exclude<CompositeFile, { binary: true }>;

interface DiffAdapter {
  show(host: HTMLElement, identity: DiffIdentity, file: TextCompositeFile): void;
  dispose(): void;
}

interface DiffPaneProps {
  readonly identity: DiffIdentity;
  readonly file: CompositeFile | null;
  readonly loadAdapter?: () => Promise<DiffAdapter>;
}

type LoadOutcome =
  | Readonly<{ key: string; status: "ready" }>
  | Readonly<{ key: string; status: "error" }>;

export const DiffPane = ({
  identity,
  file,
  loadAdapter = loadMonacoAdapter,
}: DiffPaneProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState(0);
  const [outcome, setOutcome] = useState<LoadOutcome | null>(null);
  const { repositorySessionId, requestId } = identity;
  const currentKey = file === null
    ? "empty"
    : `${repositorySessionId}:${requestId}:${file.path}:${String(retry)}`;

  useEffect(() => {
    if (file === null || file.binary === true) {
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
      loadedAdapter.show(host, { repositorySessionId, requestId }, file);
      setOutcome({ key: currentKey, status: "ready" });
      if (retry > 0) {
        host.focus();
      }
    }).catch(() => {
      if (active) {
        adapter?.dispose();
        adapter = undefined;
        setOutcome({ key: currentKey, status: "error" });
      }
    });
    return () => {
      active = false;
      adapter?.dispose();
    };
  }, [currentKey, file, loadAdapter, repositorySessionId, requestId, retry]);

  if (file === null) {
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
  }

  if (file.binary === true) {
    return (
      <section
        id="diff-review"
        className={styles.panel}
        aria-labelledby="diff-heading"
        tabIndex={-1}
      >
        <div className={styles.headingRow}>
          <h2 id="diff-heading">{reviewView(file).heading}</h2>
          <p>{file.path}</p>
        </div>
        <div className={styles.binaryState}>
          <strong>Binary file</strong>
          <p>Text diff is not available for this file. Its binary contents were not loaded.</p>
        </div>
      </section>
    );
  }

  const status = outcome?.key === currentKey ? outcome.status : "loading";
  const view = reviewView(file);
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
        aria-label={`${view.editorLabel}: ${file.path} · ${view.editorContext}`}
      />
    </section>
  );
};

interface ReviewView {
  readonly heading: string;
  readonly description: string;
  readonly editorLabel: string;
  readonly editorContext: string;
}

/** An added file has no base revision, so it is reviewed as one added document. */
function reviewView(file: CompositeFile): ReviewView {
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
