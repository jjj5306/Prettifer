import { useMemo } from "react";

import type { CompositeDiffResultDto, GroupRuleDto } from "../../shared/index.js";
import type { BaseTreeState, GroupingRulesState } from "../state/app-state.js";
import { panelClass } from "../panel-class.js";
import { ConfigGroupView } from "./ConfigGroupView.js";
import { FileButton } from "./FileButton.js";
import { FullTreeView } from "./FullTreeView.js";
import {
  buildFileTree,
  type FileTreeDirectory,
  type FileTreeNode,
} from "./file-tree.js";
import { buildReviewEntries } from "./review-entries.js";
import type { ChangedFileViewControl, FileView } from "./use-changed-file-view.js";
import styles from "./ChangedFilePane.module.css";

/**
 * The views the panel offers, as data, so adding one is a list entry rather than
 * another branch in the toggle.
 */
const FILE_VIEWS = [
  { id: "tree", label: "Tree View" },
  { id: "list", label: "List View" },
  { id: "config", label: "Config View" },
  { id: "fullTree", label: "Full Tree" },
] as const satisfies readonly { id: FileView; label: string }[];

const FILE_HISTORY_LABEL = "File History";
const FILE_HISTORY_CONDITION = "select a changed file first";

interface ChangedFilePaneProps {
  /** True while the activity rail points at this region. */
  readonly isCurrentRegion: boolean;
  readonly result: CompositeDiffResultDto;
  readonly selectedFilePath: string | null;
  /** Root of the open repository, which is the key the group rules are kept under. */
  readonly repositoryPath: string;
  readonly groupingRules: GroupingRulesState;
  /** Paths tracked at the comparison base, for the whole-repository view. */
  readonly baseTree: BaseTreeState;
  /** What the panel is showing, owned by the workbench so the rail can open it. */
  readonly control: ChangedFileViewControl;
  readonly onSelectFile: (path: string) => void;
  readonly onChangeRules: (rules: readonly GroupRuleDto[]) => void;
  /** Opens the commit history of the selected file in the review area. */
  readonly onOpenFileHistory: () => void;
}

export const ChangedFilePane = ({
  result,
  isCurrentRegion,
  selectedFilePath,
  repositoryPath,
  groupingRules,
  baseTree,
  control,
  onSelectFile,
  onChangeRules,
  onOpenFileHistory,
}: ChangedFilePaneProps) => {
  const { view, review } = control;
  /*
   * Kept across renders because Full Tree builds its structure from this, and the
   * pane re-renders on every frame of a splitter drag. Rebuilding the review list
   * would change the identity the tree is memoized on and undo that.
   */
  const entries = useMemo(() => buildReviewEntries(result), [result]);
  const tree = view === "tree" ? buildFileTree(entries) : [];

  return (
    <section
      id="changed-files"
      className={panelClass(styles.panel, isCurrentRegion)}
      aria-labelledby="changed-files-heading"
      tabIndex={-1}
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <h2 id="changed-files-heading">Changed Files</h2>
          <span>{entries.length}</span>
        </div>
        <div className={styles.viewToggle} role="group" aria-label="Changed files view">
          {FILE_VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={view === id}
              className={view === id ? styles.activeView : undefined}
              onClick={() => { control.selectView(id); }}
            >
              <ViewIcon view={id} />
            </button>
          ))}
        </div>
        <FileHistoryButton
          isFileSelected={selectedFilePath !== null}
          onOpen={onOpenFileHistory}
        />
      </header>

      <div className={styles.content}>
        {view === "config" ? (
          <ConfigGroupView
            entries={entries}
            repositoryPath={repositoryPath}
            rulesState={groupingRules}
            rules={review.rules}
            problems={review.problems}
            isEditorOpen={control.isEditorOpen}
            collapsedGroups={control.collapsedGroups}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            onToggleGroup={control.toggleGroup}
            onOpenEditor={control.openRuleEditor}
            onCloseEditor={control.closeRuleEditor}
            onChangeRules={onChangeRules}
          />
        ) : view === "fullTree" ? (
          <FullTreeView
            entries={entries}
            baseTree={baseTree}
            expandedDirectories={control.expandedBaseDirectories}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            onToggleDirectory={control.toggleBaseDirectory}
          />
        ) : entries.length === 0 ? (
          <p className={styles.empty}>No changed files in this result.</p>
        ) : view === "list" ? (
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
            collapsedDirectories={control.collapsedDirectories}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
            onToggleDirectory={control.toggleDirectory}
          />
        )}
      </div>
    </section>
  );
};

/**
 * Opens the history of the file the panel has selected. It sits beside the view
 * toggles because that is where the file was picked, but outside their group: it
 * changes what the review area shows rather than what this panel lists.
 */
const FileHistoryButton = ({
  isFileSelected,
  onOpen,
}: Readonly<{ isFileSelected: boolean; onOpen: () => void }>) => (
  <button
    type="button"
    /*
     * The condition rides in the name rather than in a tooltip, and the button
     * stays focusable, so a keyboard user reaches the reason it cannot be used.
     * A native disabled button cannot be focused and says nothing.
     */
    title={isFileSelected ? FILE_HISTORY_LABEL : FILE_HISTORY_CONDITION}
    aria-label={isFileSelected
      ? FILE_HISTORY_LABEL
      : `${FILE_HISTORY_LABEL} · ${FILE_HISTORY_CONDITION}`}
    aria-disabled={isFileSelected ? undefined : true}
    className={styles.historyAction}
    onClick={() => {
      if (isFileSelected) {
        onOpen();
      }
    }}
  >
    <FileHistoryIcon />
  </button>
);

const FileHistoryIcon = () => (
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
    <path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2.5v3.5h3.5M8 5.5V8l2 1.5" />
  </svg>
);

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
    <ViewIconShape view={view} />
  </svg>
);

/**
 * One shape per view, so a reader tells the four toggles apart before pressing
 * one: nodes for the changed tree, rows for the list, ruled groups for Config
 * View and a folder holding the whole repository for Full Tree.
 */
const ViewIconShape = ({ view }: Readonly<{ view: FileView }>) => {
  switch (view) {
    case "tree":
      return (
        <>
          <path d="M3 2.5h3v3H3zM10 10.5h3v3h-3zM3 10.5h3v3H3z" />
          <path d="M4.5 5.5v3.2M4.5 8.7h7v1.8" />
        </>
      );
    case "list":
      return (
        <>
          <path d="M5.5 3.5h7M5.5 8h7M5.5 12.5h7" />
          <path d="M3 3.5h.1M3 8h.1M3 12.5h.1" />
        </>
      );
    case "config":
      return (
        <>
          <path d="M2.5 3h11M2.5 8h11M2.5 13h11" />
          <circle cx="5.5" cy="3" r="1.4" />
          <circle cx="10.5" cy="8" r="1.4" />
          <circle cx="7" cy="13" r="1.4" />
        </>
      );
    case "fullTree":
      return (
        <>
          <path d="M1.5 3.5h4.5l1.5 2h7v8h-13z" />
          <path d="M5 8.5v4.5M5 9.5h2.5M5 12.5h5" />
        </>
      );
  }
};

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
