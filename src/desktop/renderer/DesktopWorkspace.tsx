import { useState, type CSSProperties } from "react";

import type { AppController } from "./controller/use-app-controller.js";
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
  currentPanel,
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
  const resultAvailable = controller.state.composition.status === "ready";
  /*
   * The panel the rail points at, marked so a mouse user sees where the rail
   * took them. The rail decides the same thing for its own current item, so both
   * read it from one place and cannot disagree.
   */
  const fileSelected = controller.state.selectedFilePath !== null;
  const markedPanel = currentPanel(activeRegion, resultAvailable, fileSelected);
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
   * The rail names regions, except for Group Rules, which is a place inside the
   * changed file panel. Activating it puts the panel there instead of leaving
   * the user to find the view toggle.
   */
  const handleActivateRegion = (region: WorkbenchRegion): void => {
    if (region === "rules") {
      changedFileView.openRuleEditor();
    }
    if (region === "fileHistory") {
      void controller.loadFileHistory();
    }
    setActiveRegion(region);
  };
  const {
    containerRef: resultGridRef,
    control: changedFilesWidth,
  } = useResizablePane(CHANGED_FILES_WIDTH_LIMITS, DEFAULT_CHANGED_FILES_WIDTH);
  return (
    <>
      <ActivityRail
        activeRegion={activeRegion}
        resultAvailable={resultAvailable}
        fileSelected={fileSelected}
        onActivate={handleActivateRegion}
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
          isCurrentRegion={markedPanel === "repository"}
          repository={controller.state.repository}
          range={controller.state.range}
          onOpenRepository={controller.openRepository}
          onLoadRange={controller.loadRange}
        />
        <div className={styles.workbench}>
          <div className={styles.workspaceGrid}>
            <CommitHistoryPane
              isCurrentRegion={markedPanel === "history"}
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
                  {activeRegion === "fileHistory" ? (
                    <FileHistoryPane
                      isCurrentRegion={markedPanel === "files"}
                      history={controller.state.fileHistory}
                      selectedCommits={controller.state.selectedCommitIds}
                      result={controller.state.composition.result}
                      onFocusCommit={controller.focusFileHistoryCommit}
                      onOpenCommit={(commitId, path) => {
                        void controller.openFileCommit(commitId, path);
                      }}
                      onLoadMore={() => { void controller.loadMoreFileHistory(); }}
                      onReturnToComposite={controller.closeFileCommit}
                    />
                  ) : (
                    <ChangedFilePane
                      isCurrentRegion={markedPanel === "files"}
                      result={controller.state.composition.result}
                      selectedFilePath={controller.state.selectedFilePath}
                      repositoryPath={repositorySession?.rootPath ?? ""}
                      groupingRules={controller.state.groupingRules}
                      baseTree={controller.state.baseTree}
                      control={changedFileView}
                      onSelectFile={controller.selectFile}
                      onChangeRules={(rules) => {
                        void controller.saveGroupingRules(rules);
                      }}
                    />
                  )}
                  <PaneSplitter
                    label="Resize Changed Files"
                    controls="changed-files"
                    pane={changedFilesWidth}
                  />
                  <div className={styles.reviewColumn}>
                    <DiffErrorBoundary onRecover={() => undefined}>
                      <DiffPane
                        isCurrentRegion={markedPanel === "diff"}
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
                        onCloseFileCommit={controller.closeFileCommit}
                        onSymbol={(symbol, mode, usage) => {
                          void controller.lookUpSymbol(symbol, mode, usage);
                        }}
                      />
                    </DiffErrorBoundary>
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
