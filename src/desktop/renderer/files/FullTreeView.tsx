import { useMemo } from "react";

import type { BaseTreeState } from "../state/app-state.js";
import { FileButton } from "./FileButton.js";
import {
  buildFullTree,
  type FullTreeDirectory,
  type FullTreeNode,
} from "./full-tree.js";
import type { ReviewEntry } from "./review-entries.js";
import styles from "./ChangedFilePane.module.css";

const EMPTY_PATHS: readonly string[] = [];

interface FullTreeViewProps {
  readonly entries: readonly ReviewEntry[];
  readonly baseTree: BaseTreeState;
  readonly expandedDirectories: ReadonlySet<string>;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleDirectory: (path: string) => void;
  readonly mode?: "review" | "history";
}

/**
 * Shows the whole repository structure at the comparison base with the review's
 * changes placed in it, so a change can be read against the project around it.
 */
export const FullTreeView = ({
  entries,
  baseTree,
  expandedDirectories,
  selectedFilePath,
  onSelectFile,
  onToggleDirectory,
  mode = "review",
}: FullTreeViewProps) => {
  /*
   * The structure is built from every tracked path, which the limit puts in the
   * thousands, and the pane re-renders on every frame of a splitter drag. It is
   * built once per path list and result instead.
   */
  const paths = baseTree.status === "ready" ? baseTree.paths : EMPTY_PATHS;
  const nodes = useMemo(() => buildFullTree(paths, entries), [paths, entries]);

  if (baseTree.status === "idle" || baseTree.status === "loading") {
    return <p className={styles.empty}>Reading the repository file list…</p>;
  }
  if (baseTree.status === "error") {
    return (
      <div className={styles.notice}>
        <p className={styles.problem} role="alert">
          {baseTree.diagnostic.message} {baseTree.diagnostic.nextAction}
        </p>
        <p className={styles.empty}>
          The other views only need the selected result, so they are unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.fullTree}>
      {baseTree.truncated ? <TruncationNote /> : null}
      <BaseTree
        nodes={nodes}
        expandedDirectories={expandedDirectories}
        selectedFilePath={selectedFilePath}
        onSelectFile={onSelectFile}
        onToggleDirectory={onToggleDirectory}
        mode={mode}
      />
    </div>
  );
};

const TruncationNote = () => (
  <p className={styles.problem}>
    This repository has more tracked files than Full Tree shows. Use Tree View or
    List View to see every changed file.
  </p>
);

interface BaseTreeProps {
  readonly nodes: readonly FullTreeNode[];
  readonly expandedDirectories: ReadonlySet<string>;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleDirectory: (path: string) => void;
  readonly mode: "review" | "history";
}

const BaseTree = ({
  nodes,
  expandedDirectories,
  selectedFilePath,
  onSelectFile,
  onToggleDirectory,
  mode,
}: BaseTreeProps) => (
  <ul className={styles.tree}>
    {nodes.map((node) => (
      <li key={`${node.kind}:${node.path}`}>
        {node.kind === "directory" ? (
          <BaseDirectory
            node={node}
            expandedDirectories={expandedDirectories}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            onToggleDirectory={onToggleDirectory}
            mode={mode}
          />
        ) : node.entry === null ? (
          <UnchangedFileButton
            name={node.name}
            path={node.path}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            mode={mode}
          />
        ) : (
          <FileButton
            entry={node.entry}
            label={node.name}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        )}
      </li>
    ))}
  </ul>
);

interface BaseDirectoryProps {
  readonly node: FullTreeDirectory;
  readonly expandedDirectories: ReadonlySet<string>;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleDirectory: (path: string) => void;
  readonly mode: "review" | "history";
}

const BaseDirectory = ({
  node,
  expandedDirectories,
  selectedFilePath,
  onSelectFile,
  onToggleDirectory,
  mode,
}: BaseDirectoryProps) => {
  const isExpanded = expandedDirectories.has(node.path);

  return (
    <>
      <button
        type="button"
        title={node.path}
        aria-expanded={isExpanded}
        aria-label={mode === "history"
          ? node.path
          : `${node.path}${node.hasChanges ? ", contains changes" : ", no changes"}`}
        className={node.hasChanges ? styles.changedDirectory : styles.directory}
        onClick={() => { onToggleDirectory(node.path); }}
      >
        <span className={styles.twisty} aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
        <span className={styles.path}>{node.name}</span>
        {node.hasChanges ? (
          <span className={styles.changeDot} aria-hidden="true">•</span>
        ) : null}
      </button>
      {isExpanded ? (
        <BaseTree
          nodes={node.children}
          expandedDirectories={expandedDirectories}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          onToggleDirectory={onToggleDirectory}
          mode={mode}
        />
      ) : null}
    </>
  );
};

/**
 * A file the selection never changed. It has no composed entry, so it carries no
 * change status and reads at the comparison base when the user opens it.
 */
const UnchangedFileButton = ({
  name,
  path,
  selectedFilePath,
  onSelectFile,
  mode,
}: Readonly<{
  name: string;
  path: string;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
  mode: "review" | "history";
}>) => {
  const isSelected = path === selectedFilePath;

  return (
    <button
      type="button"
      title={path}
      aria-pressed={isSelected}
      aria-label={mode === "history"
        ? `${isSelected ? "Currently viewing history" : "View history"}: ${path}`
        : `${isSelected ? "Currently viewing" : "View"} file: ${path} (Unchanged)`}
      className={isSelected ? styles.selectedFile : styles.file}
      onClick={() => { onSelectFile(path); }}
    >
      <span className={`${styles.status} ${styles.unchanged}`} aria-hidden="true">·</span>
      <span className={styles.path}>{name}</span>
    </button>
  );
};
