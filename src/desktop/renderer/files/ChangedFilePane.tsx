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
}: ChangedFilePaneProps) => {
  const { view, review } = control;
  const entries = buildReviewEntries(result);
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
    ) : view === "list" ? (
      <>
        <path d="M5.5 3.5h7M5.5 8h7M5.5 12.5h7" />
        <path d="M3 3.5h.1M3 8h.1M3 12.5h.1" />
      </>
    ) : (
      <>
        <path d="M2.5 3h11M2.5 8h11M2.5 13h11" />
        <path d="M5.5 3v0M10.5 8v0M7 13v0" />
        <circle cx="5.5" cy="3" r="1.4" />
        <circle cx="10.5" cy="8" r="1.4" />
        <circle cx="7" cy="13" r="1.4" />
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
