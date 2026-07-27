import type { AppController } from "./controller/use-app-controller.js";
import { CompositeResultHeader } from "./composition/CompositeResultHeader.js";
import { DiffPane } from "./diff/DiffPane.js";
import { DiffErrorBoundary } from "./errors/DiffErrorBoundary.js";
import { ChangedFilePane } from "./files/ChangedFilePane.js";
import { CommitHistoryPane } from "./history/CommitHistoryPane.js";
import { RepositoryToolbar } from "./repository/RepositoryToolbar.js";
import {
  selectRepositorySession,
  selectSelectedFile,
} from "./state/app-selectors.js";
import styles from "./App.module.css";

interface DesktopWorkspaceProps {
  readonly controller: AppController;
}

export const DesktopWorkspace = ({ controller }: DesktopWorkspaceProps) => {
  const selectedFile = selectSelectedFile(controller.state);
  const repositorySession = selectRepositorySession(controller.state.repository);
  return (
    <>
      <header className={styles.appHeader}>
        <span className={styles.brandMark} aria-hidden="true">P</span>
        <h1 className={styles.title}>Prettifer</h1>
        <p className={styles.repositoryContext}>
          {repositorySession?.rootPath ?? "No repository open"}
        </p>
      </header>
      <RepositoryToolbar
        repository={controller.state.repository}
        range={controller.state.range}
        onOpenRepository={controller.openRepository}
        onLoadRange={controller.loadRange}
      />
      <div className={styles.workspaceGrid}>
        <CommitHistoryPane
          range={controller.state.range}
          selectedCommitIds={controller.state.selectedCommitIds}
          inspectedCommitId={controller.state.inspectedCommitId}
          onToggleCommit={controller.toggleCommit}
          onInspectCommit={controller.inspectCommit}
          onLoadMore={controller.loadMoreCommits}
        />
        <div className={styles.reviewArea}>
          {controller.state.range.status === "ready" ? (
            <CompositeResultHeader
              composition={controller.state.composition}
              range={controller.state.range.range}
              selectedCount={controller.state.selectedCommitIds.length}
              onCompose={controller.composeSelection}
              onCancel={controller.cancelComposition}
            />
          ) : (
            <section className={styles.placeholder} aria-labelledby="result-placeholder-heading">
              <h2 id="result-placeholder-heading">Selected Result</h2>
              <p>Load a comparison range to build a selected result.</p>
            </section>
          )}
          {controller.state.composition.status === "ready" ? (
            <div className={styles.resultGrid}>
              <ChangedFilePane
                result={controller.state.composition.result}
                selectedFilePath={controller.state.selectedFilePath}
                onSelectFile={controller.selectFile}
              />
              <DiffErrorBoundary onRecover={() => undefined}>
                <DiffPane
                  identity={{
                    repositorySessionId: repositorySession?.repositorySessionId
                      ?? "expired-session",
                    requestId: controller.state.composition.requestId,
                  }}
                  file={selectedFile}
                />
              </DiffErrorBoundary>
            </div>
          ) : null}
        </div>
      </div>
      <footer className={styles.statusBar} aria-label="Workspace status">
        <span>{workspaceStatus(controller)}</span>
        <span>{String(controller.state.selectedCommitIds.length)} selected</span>
        <span className={styles.preserved}>Working tree preserved</span>
      </footer>
    </>
  );
};

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
