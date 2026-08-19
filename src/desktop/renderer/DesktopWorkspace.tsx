import { useState, type CSSProperties } from "react";

import type { AppController } from "./controller/use-app-controller.js";
import { AboutPrettifer } from "./about/AboutPrettifer.js";
import { CompositeResultHeader } from "./composition/CompositeResultHeader.js";
import { DiffPane } from "./diff/DiffPane.js";
import { DiffErrorBoundary } from "./errors/DiffErrorBoundary.js";
import { ChangedFilePane } from "./files/ChangedFilePane.js";
import { changedPathsOf } from "./files/full-tree.js";
import { useChangedFileView } from "./files/use-changed-file-view.js";
import { CommitHistoryPane } from "./history/CommitHistoryPane.js";
import { FileHistoryPane } from "./history/FileHistoryPane.js";
import { ActivityRail } from "./navigation/ActivityRail.js";
import {
  currentRegion,
  type WorkbenchRegion,
} from "./navigation/workbench-region.js";
import { PaneSplitter } from "./layout/PaneSplitter.js";
import {
  useResizablePane,
  type PaneWidthLimits,
} from "./layout/use-resizable-pane.js";
import { RepositoryToolbar } from "./repository/RepositoryToolbar.js";
import { SymbolPanel } from "./symbols/SymbolPanel.js";
import {
  selectPendingMainlineParents,
  selectRepositorySession,
  selectSelectedFile,
  selectSelectedProblemFile,
} from "./state/app-selectors.js";
import styles from "./App.module.css";

const CHANGED_FILES_WIDTH_LIMITS: PaneWidthLimits = {
  minimum: 176,
  maximum: 720,
  minimumRemaining: 384,
};
const DEFAULT_CHANGED_FILES_WIDTH = 288;

interface DesktopWorkspaceProps {
  readonly controller: AppController;
}

export const DesktopWorkspace = ({ controller }: DesktopWorkspaceProps) => {
  const selectedFile = selectSelectedFile(controller.state);
  const repositorySession = selectRepositorySession(controller.state.repository);
  const [activeRegion, setActiveRegion] = useState<WorkbenchRegion>("repository");
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const resultAvailable = controller.state.composition.status === "ready";
  const fileSelected = controller.state.selectedFilePath !== null;
  /*
   * The panel to mark as current, so a user who clicked sees where they were
   * taken. A region whose result the workbench no longer has falls back here, and
   * every panel marker reads the answer from this one place.
   */
  const markedRegion = currentRegion(activeRegion, resultAvailable, fileSelected);
  /*
   * What the review column shows is read out of the review state itself: an open
   * history means the list, and a change opened from that list takes its place.
   * A second copy of the step could disagree with the state holding the data.
   */
  const isHistoryOpen = controller.state.fileHistory.status !== "idle";
  const showsHistoryList = isHistoryOpen
    && controller.state.fileCommit.status === "idle";
  const changedFileView = useChangedFileView(
    controller.state.selectedFilePath,
    controller.state.groupingRules,
    {
      changedPaths: controller.state.composition.status === "ready"
        ? changedPathsOf(controller.state.composition.result)
        : [],
      onShowFullTree: () => { void controller.loadBaseTree(); },
    },
  );

  /*
   * The history of the file the user just picked, opened from the panel that
   * holds the selection. Focus follows to the list, which mounts as a result of
   * the state update this starts.
   */
  const handleOpenFileHistory = (): void => {
    setActiveRegion("fileHistory");
    void controller.loadFileHistory();
    focusWhenMounted("file-history");
  };
  const handleOpenHistoryCommit = (commitId: string, path: string): void => {
    setActiveRegion("diff");
    void controller.openFileCommit(commitId, path);
    focusWhenMounted("diff-review");
  };
  const handleCloseHistoryCommit = (): void => {
    controller.closeFileCommit();
    setActiveRegion("fileHistory");
  };
  const handleCloseFileHistory = (): void => {
    controller.closeFileHistory();
    setActiveRegion("files");
  };
  /*
   * Selecting a file leaves the file history behind, so the region follows the
   * click instead of staying on a panel the selection just closed.
   */
  const handleSelectFile = (path: string): void => {
    controller.selectFile(path);
    setActiveRegion("files");
  };
  const handleOpenAbout = (): void => {
    setIsAboutOpen(true);
    void controller.loadAppInfo();
  };
  const {
    containerRef: resultGridRef,
    control: changedFilesWidth,
  } = useResizablePane(CHANGED_FILES_WIDTH_LIMITS, DEFAULT_CHANGED_FILES_WIDTH);
  return (
    <>
      <ActivityRail
        activeRegion={activeRegion}
        onActivate={setActiveRegion}
        onOpenAbout={handleOpenAbout}
      />
      <div className={styles.appContent}>
        <header className={styles.appHeader}>
          <span className={styles.brandMark} aria-hidden="true">P</span>
          <h1 className={styles.title}>Prettifer</h1>
          <p className={styles.repositoryContext}>
            <span className={styles.repositoryPath}>
              {repositorySession?.rootPath ?? "No repository open"}
            </span>
            {repositorySession === null ? null : (
              <span className={styles.branchContext}>
                Current branch: {repositorySession.currentBranch ?? "Detached HEAD"}
              </span>
            )}
          </p>
        </header>
        <RepositoryToolbar
          isCurrentRegion={markedRegion === "repository"}
          repository={controller.state.repository}
          range={controller.state.range}
          onOpenRepository={controller.openRepository}
          onLoadRange={controller.loadRange}
        />
        <div className={styles.workbench}>
          <div className={styles.workspaceGrid}>
            <CommitHistoryPane
              isCurrentRegion={markedRegion === "history"}
              range={controller.state.range}
              selectedCommitIds={controller.state.selectedCommitIds}
              mergeParents={controller.state.mergeParents}
              inspectedCommitId={controller.state.inspectedCommitId}
              onToggleCommit={controller.toggleCommit}
              onChooseMainlineParent={controller.chooseMainlineParent}
              onInspectCommit={controller.inspectCommit}
              onLoadMore={controller.loadMoreCommits}
              onResetLoaded={controller.resetLoadedCommits}
              onClearSelection={controller.clearCommitSelection}
            />
            <div className={styles.reviewArea}>
              {controller.state.range.status === "ready" ? (
                <CompositeResultHeader
                  composition={controller.state.composition}
                  range={controller.state.range.range}
                  selectedCount={controller.state.selectedCommitIds.length}
                  pendingMainlineParents={selectPendingMainlineParents(controller.state)}
                  onCompose={controller.composeSelection}
                  onCancel={controller.cancelComposition}
                  onSelectFile={controller.selectFile}
                />
              ) : (
                <section className={styles.placeholder} aria-labelledby="result-placeholder-heading">
                  <h2 id="result-placeholder-heading">Selected Result</h2>
                  <p>Load a comparison range to build a selected result.</p>
                </section>
              )}
              {controller.state.composition.status === "ready" ? (
                <div
                  ref={resultGridRef}
                  className={styles.resultGrid}
                  style={changedFilesColumn(changedFilesWidth.width)}
                >
                  <ChangedFilePane
                    isCurrentRegion={markedRegion === "files"}
                    result={controller.state.composition.result}
                    selectedFilePath={controller.state.selectedFilePath}
                    repositoryPath={repositorySession?.rootPath ?? ""}
                    groupingRules={controller.state.groupingRules}
                    baseTree={controller.state.baseTree}
                    control={changedFileView}
                    onSelectFile={handleSelectFile}
                    onChangeRules={(rules) => {
                      void controller.saveGroupingRules(rules);
                    }}
                    onOpenFileHistory={handleOpenFileHistory}
                  />
                  <PaneSplitter
                    label="Resize Changed Files"
                    controls="changed-files"
                    pane={changedFilesWidth}
                  />
                  <div className={styles.reviewColumn}>
                    {showsHistoryList ? (
                      <FileHistoryPane
                        isCurrentRegion={markedRegion === "fileHistory"}
                        history={controller.state.fileHistory}
                        selectedCommits={controller.state.selectedCommitIds}
                        result={controller.state.composition.result}
                        onFocusCommit={controller.focusFileHistoryCommit}
                        onOpenCommit={handleOpenHistoryCommit}
                        onLoadMore={() => { void controller.loadMoreFileHistory(); }}
                        onReturnToResult={handleCloseFileHistory}
                      />
                    ) : (
                      <DiffErrorBoundary onRecover={() => undefined}>
                        <DiffPane
                          isCurrentRegion={markedRegion === "diff"}
                          identity={{
                            repositorySessionId: repositorySession?.repositorySessionId
                              ?? "expired-session",
                            requestId: controller.state.composition.requestId,
                          }}
                          file={selectedFile}
                          problem={selectSelectedProblemFile(controller.state)}
                          externalFile={controller.state.externalFile}
                          reveal={controller.state.reveal}
                          fileCommit={controller.state.fileCommit}
                          onCloseFileCommit={handleCloseHistoryCommit}
                          onSymbol={(symbol, mode, usage) => {
                            void controller.lookUpSymbol(symbol, mode, usage);
                          }}
                        />
                      </DiffErrorBoundary>
                    )}
                    <SymbolPanel
                      lookup={controller.state.symbolLookup}
                      canGoBack={controller.state.navigationHistory.length > 0}
                      onGoToHit={controller.goToHit}
                      onDismiss={controller.dismissSymbolLookup}
                      onGoBack={controller.goBack}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <AboutPrettifer
          isOpen={isAboutOpen}
          appInfo={controller.state.appInfo}
          onClose={() => { setIsAboutOpen(false); }}
        />
        <footer className={styles.statusBar} aria-label="Workspace status">
          <span>{workspaceStatus(controller)}</span>
          <span>{String(controller.state.selectedCommitIds.length)} selected</span>
          <span className={styles.preserved}>Working tree preserved</span>
        </footer>
      </div>
    </>
  );
};

/**
 * Focuses a region that the state update of this interaction mounts. The element
 * does not exist yet on the frame the handler runs in, so the second attempt is
 * the one that lands.
 */
function focusWhenMounted(targetId: string): void {
  const target = document.getElementById(targetId);
  if (target !== null) {
    target.focus();
    return;
  }
  window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.focus();
  });
}

/**
 * Only the custom property is set inline so the narrow-layout media query can
 * still replace the whole column definition.
 */
function changedFilesColumn(width: number): CSSProperties {
  return { "--changed-files-width": `${width}px` } as CSSProperties;
}

function workspaceStatus(controller: AppController): string {
  if (controller.state.repository.status === "selecting") {
    return "Opening repository…";
  }
  if (controller.state.range.status === "loading") {
    return "Loading commit range…";
  }
  if (controller.state.composition.status === "loading") {
    return "Building selected result…";
  }
  if (controller.state.composition.status === "ready") {
    return `${String(controller.state.composition.result.files.length)} changed files`;
  }
  return "Ready";
}
