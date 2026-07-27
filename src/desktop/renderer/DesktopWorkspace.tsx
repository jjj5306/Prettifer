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
      <p className={styles.eyebrow}>Local composite diff</p>
      <h1 className={styles.title}>Prettifer</h1>
      <p className={styles.description}>
        로컬 저장소에서 필요한 커밋을 선택하고 통합 diff를 검토하세요.
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
            <h2 id="result-placeholder-heading">통합 결과</h2>
            <p>브랜치 범위를 불러오면 통합 결과를 만들 수 있습니다.</p>
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
                  repositorySessionId: repositorySession?.repositorySessionId ?? "expired-session",
                  requestId: controller.state.composition.requestId,
                }}
                file={selectedFile}
              />
            </DiffErrorBoundary>
          </div>
        ) : null}
      </div>
    </div>
    </>
  );
};
