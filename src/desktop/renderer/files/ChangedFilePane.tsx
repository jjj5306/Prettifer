import { useState } from "react";

import type { CompositeDiffResultDto } from "../../shared/index.js";
import {
  buildFileTree,
  type FileTreeDirectory,
  type FileTreeNode,
} from "./file-tree.js";
import { buildReviewEntries, type ReviewEntry } from "./review-entries.js";
import styles from "./ChangedFilePane.module.css";

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
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const entries = buildReviewEntries(result);
  const tree = view === "tree" ? buildFileTree(entries) : [];

  const handleToggleDirectory = (path: string) => {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <section
      id="changed-files"
      className={styles.panel}
      aria-labelledby="changed-files-heading"
      tabIndex={-1}
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <h2 id="changed-files-heading">Changed Files</h2>
          <span>{entries.length}</span>
        </div>
        <div className={styles.viewToggle} role="group" aria-label="Changed files view">
          <button
            type="button"
            title="Tree View"
            aria-label="Tree View"
            aria-pressed={view === "tree"}
            className={view === "tree" ? styles.activeView : undefined}
            onClick={() => { setView("tree"); }}
          >
            <ViewIcon view="tree" />
          </button>
          <button
            type="button"
            title="List View"
            aria-label="List View"
            aria-pressed={view === "list"}
            className={view === "list" ? styles.activeView : undefined}
            onClick={() => { setView("list"); }}
          >
            <ViewIcon view="list" />
          </button>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className={styles.empty}>No changed files in this result.</p>
      ) : (
        <div className={styles.content}>
          {view === "list" ? (
            <ul className={styles.fileList}>
              {entries.map((entry) => (
                <li key={entry.path}>
                  <FileButton
                    entry={entry}
                    label={entry.path}
                    selectedFilePath={selectedFilePath}
                    onSelectFile={onSelectFile}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <FileTree
              nodes={tree}
              collapsedDirectories={collapsedDirectories}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
              onToggleDirectory={handleToggleDirectory}
            />
          )}
        </div>
      )}
    </section>
  );
};

const ViewIcon = ({ view }: Readonly<{ view: FileView }>) => (
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
    {view === "tree" ? (
      <>
        <path d="M3 2.5h3v3H3zM10 10.5h3v3h-3zM3 10.5h3v3H3z" />
        <path d="M4.5 5.5v3.2M4.5 8.7h7v1.8" />
      </>
    ) : (
      <>
        <path d="M5.5 3.5h7M5.5 8h7M5.5 12.5h7" />
        <path d="M3 3.5h.1M3 8h.1M3 12.5h.1" />
      </>
    )}
  </svg>
);

interface FileTreeProps {
  readonly nodes: readonly FileTreeNode[];
  readonly collapsedDirectories: ReadonlySet<string>;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleDirectory: (path: string) => void;
}

const FileTree = ({
  nodes,
  collapsedDirectories,
  selectedFilePath,
  onSelectFile,
  onToggleDirectory,
}: FileTreeProps) => (
  <ul className={styles.tree}>
    {nodes.map((node) => (
      <li key={`${node.kind}:${node.path}`}>
        {node.kind === "directory" ? (
          <DirectoryBranch
            node={node}
            collapsedDirectories={collapsedDirectories}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            onToggleDirectory={onToggleDirectory}
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

interface DirectoryBranchProps {
  readonly node: FileTreeDirectory;
  readonly collapsedDirectories: ReadonlySet<string>;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleDirectory: (path: string) => void;
}

const DirectoryBranch = ({
  node,
  collapsedDirectories,
  selectedFilePath,
  onSelectFile,
  onToggleDirectory,
}: DirectoryBranchProps) => {
  const isExpanded = !collapsedDirectories.has(node.path);

  return (
    <>
      <button
        type="button"
        title={node.path}
        aria-expanded={isExpanded}
        className={styles.directory}
        onClick={() => { onToggleDirectory(node.path); }}
      >
        <span className={styles.twisty} aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
        <span className={styles.path}>{node.name}</span>
      </button>
      {isExpanded ? (
        <FileTree
          nodes={node.children}
          collapsedDirectories={collapsedDirectories}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
          onToggleDirectory={onToggleDirectory}
        />
      ) : null}
    </>
  );
};

interface FileButtonProps {
  readonly entry: ReviewEntry;
  readonly label: string;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
}

const FileButton = ({
  entry,
  label,
  selectedFilePath,
  onSelectFile,
}: FileButtonProps) => {
  const file = { path: entry.path, status: entryStatus(entry) };
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

type ReviewStatus = "added" | "modified" | "deleted" | "problem";

function entryStatus(entry: ReviewEntry): ReviewStatus {
  return entry.kind === "problem" ? "problem" : entry.file.status;
}

function fileStatus(
  status: ReviewStatus,
): Readonly<{ code: string; label: string }> {
  switch (status) {
    case "added":
      return { code: "A", label: "Added" };
    case "modified":
      return { code: "M", label: "Modified" };
    case "deleted":
      return { code: "D", label: "Deleted" };
    case "problem":
      return { code: "!", label: "Problem" };
  }
}
