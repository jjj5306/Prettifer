import type { BaseTreeState } from "../state/app-state.js";
import { FullTreeView } from "../files/FullTreeView.js";
import type { ReviewEntry } from "../files/review-entries.js";
import { panelClass } from "../panel-class.js";
import fileStyles from "../files/ChangedFilePane.module.css";
import styles from "./FileHistoryFilePane.module.css";

const NO_REVIEW_ENTRIES: readonly ReviewEntry[] = [];

interface FileHistoryFilePaneProps {
  readonly isCurrentRegion: boolean;
  readonly tree: BaseTreeState;
  readonly selectedPath: string | null;
  readonly expandedDirectories: ReadonlySet<string>;
  readonly onSelectFile: (path: string) => void;
  readonly onToggleDirectory: (path: string) => void;
}

export const FileHistoryFilePane = ({
  isCurrentRegion,
  tree,
  selectedPath,
  expandedDirectories,
  onSelectFile,
  onToggleDirectory,
}: FileHistoryFilePaneProps) => (
  <section
    id="file-history"
    className={panelClass(`${fileStyles.panel} ${styles.panel}`, isCurrentRegion)}
    aria-label="File History"
    tabIndex={-1}
  >
    <header className={styles.heading}>
      <h2>Choose a File</h2>
      <p>Select a repository file to review every commit that changed it.</p>
    </header>
    <div className={fileStyles.content}>
      <FullTreeView
        entries={NO_REVIEW_ENTRIES}
        baseTree={tree}
        expandedDirectories={expandedDirectories}
        selectedFilePath={selectedPath}
        onSelectFile={onSelectFile}
        onToggleDirectory={onToggleDirectory}
        mode="history"
      />
    </div>
  </section>
);
