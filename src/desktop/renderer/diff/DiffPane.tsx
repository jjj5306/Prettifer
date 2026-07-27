import { useEffect, useRef, useState } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import {
  MonacoDiffAdapter,
  type DiffIdentity,
  type MonacoApi,
} from "./MonacoDiffAdapter.js";
import styles from "./DiffPane.module.css";

type CompositeFile = CompositeDiffResultDto["files"][number];

interface DiffAdapter {
  show(host: HTMLElement, identity: DiffIdentity, file: CompositeFile): void;
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
    if (file === null) {
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
      <section className={styles.panel} aria-labelledby="diff-heading">
        <h2 id="diff-heading">좌우 diff</h2>
        <p>표시할 변경 파일을 선택해 주세요.</p>
      </section>
    );
  }

  const status = outcome?.key === currentKey ? outcome.status : "loading";
  return (
    <section className={styles.panel} aria-labelledby="diff-heading">
      <div className={styles.headingRow}>
        <h2 id="diff-heading">좌우 diff</h2>
        <p>왼쪽 원본 · 오른쪽 통합 결과</p>
      </div>
      {status === "loading" ? (
        <p aria-live="polite">diff 편집기를 불러오는 중입니다.</p>
      ) : null}
      {status === "error" ? (
        <div role="alert" className={styles.error}>
          <p>diff 편집기를 열 수 없습니다. 현재 파일의 diff를 다시 열어 주세요.</p>
          <button type="button" onClick={() => { setRetry((current) => current + 1); }}>
            diff 다시 열기
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
        aria-label={`읽기 전용 diff: ${file.path} · 원본과 통합 결과`}
      />
    </section>
  );
};

async function loadMonacoAdapter(): Promise<DiffAdapter> {
  const monaco = await import("monaco-editor");
  return new MonacoDiffAdapter(monaco as unknown as MonacoApi);
}
