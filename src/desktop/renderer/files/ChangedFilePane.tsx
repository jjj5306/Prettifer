import { useState } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import { buildFileTree, type FileTreeNode } from "./file-tree.js";
import styles from "./ChangedFilePane.module.css";

type CompositeFile = CompositeDiffResultDto["files"][number];
type FileView = "tree" | "list";

interface ChangedFilePaneProps {
  readonly result: CompositeDiffResultDto;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
}

export const ChangedFilePane = ({
  result,
  selectedFilePath,
  onSelectFile,
}: ChangedFilePaneProps) => {
  const [view, setView] = useState<FileView>("list");
  const tree = buildFileTree(result.files);

  return (
    <section className={styles.panel} aria-labelledby="changed-files-heading">
      <header className={styles.header}>
        <div className={styles.title}>
          <h2 id="changed-files-heading">Changed Files</h2>
          <span>{result.files.length}</span>
        </div>
        <div className={styles.viewToggle} role="group" aria-label="Changed files view">
          <button
            type="button"
            aria-pressed={view === "tree"}
            className={view === "tree" ? styles.activeView : undefined}
            onClick={() => { setView("tree"); }}
          >
            Tree View
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            className={view === "list" ? styles.activeView : undefined}
            onClick={() => { setView("list"); }}
          >
            List View
          </button>
        </div>
      </header>

      {result.files.length === 0 ? (
        <p className={styles.empty}>No changed files in this result.</p>
      ) : (
        <div className={styles.content}>
          {view === "list" ? (
            <ul className={styles.fileList}>
              {result.files.map((file) => (
                <li key={file.path}>
                  <FileButton
                    file={file}
                    label={file.path}
                    selectedFilePath={selectedFilePath}
                    onSelectFile={onSelectFile}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <FileTree
              nodes={tree}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
            />
          )}
        </div>
      )}
    </section>
  );
};

interface FileTreeProps {
  readonly nodes: readonly FileTreeNode[];
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
}

const FileTree = ({
  nodes,
  selectedFilePath,
  onSelectFile,
}: FileTreeProps) => (
  <ul className={styles.tree}>
    {nodes.map((node) => (
      <li key={`${node.kind}:${node.path}`}>
        {node.kind === "directory" ? (
          <>
            <span className={styles.directory}>
              <span aria-hidden="true">▾</span>
              <span>{node.name}</span>
            </span>
            <FileTree
              nodes={node.children}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
            />
          </>
        ) : (
          <FileButton
            file={node.file}
            label={node.name}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        )}
      </li>
    ))}
  </ul>
);

interface FileButtonProps {
  readonly file: CompositeFile;
  readonly label: string;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
}

const FileButton = ({
  file,
  label,
  selectedFilePath,
  onSelectFile,
}: FileButtonProps) => {
  const status = fileStatus(file.status);
  const isSelected = file.path === selectedFilePath;

  return (
    <button
      type="button"
      title={file.path}
      aria-pressed={isSelected}
      aria-label={`${isSelected ? "Currently viewing" : "View"} file: ${file.path} (${status.label})`}
      className={isSelected ? styles.selectedFile : styles.file}
      onClick={() => { onSelectFile(file.path); }}
    >
      <span className={`${styles.status} ${styles[file.status]}`} aria-hidden="true">
        {status.code}
      </span>
      <span className={styles.path}>{label}</span>
    </button>
  );
};

function fileStatus(
  status: CompositeFile["status"],
): Readonly<{ code: string; label: string }> {
  switch (status) {
    case "added":
      return { code: "A", label: "Added" };
    case "modified":
      return { code: "M", label: "Modified" };
    case "deleted":
      return { code: "D", label: "Deleted" };
  }
}
