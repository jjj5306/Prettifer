import type { RepositoryCommitDto } from "../../shared/index.js";
import styles from "./CommitHistoryPane.module.css";

interface CommitDetailsProps {
  readonly commit: RepositoryCommitDto | null;
}

export const CommitDetails = ({ commit }: CommitDetailsProps) => (
  <section className={styles.details} aria-labelledby="commit-details-heading">
    <h3 id="commit-details-heading">현재 탐색 커밋</h3>
    {commit === null ? (
      <p>자세히 볼 커밋을 선택해 주세요.</p>
    ) : (
      <dl>
        <div><dt>전체 ID</dt><dd>{commit.id}</dd></div>
        <div><dt>제목</dt><dd>{commit.title}</dd></div>
        <div><dt>작성자</dt><dd>{commit.authorName}</dd></div>
        <div><dt>작성 시각</dt><dd><time dateTime={commit.authoredAt}>{commit.authoredAt}</time></dd></div>
      </dl>
    )}
  </section>
);
