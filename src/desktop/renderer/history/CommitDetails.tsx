import type { RepositoryCommitDto } from "../../shared/index.js";
import styles from "./CommitHistoryPane.module.css";

interface CommitDetailsProps {
  readonly commit: RepositoryCommitDto | null;
}

export const CommitDetails = ({ commit }: CommitDetailsProps) => (
  <section className={styles.details} aria-labelledby="commit-details-heading">
    <h3 id="commit-details-heading">Inspected Commit</h3>
    {commit === null ? (
      <p>Choose a commit to inspect its details.</p>
    ) : (
      <dl>
        <div><dt>Full ID</dt><dd>{commit.id}</dd></div>
        <div><dt>Title</dt><dd>{commit.title}</dd></div>
        <div><dt>Author</dt><dd>{commit.authorName}</dd></div>
        <div><dt>Authored</dt><dd><time dateTime={commit.authoredAt}>{commit.authoredAt}</time></dd></div>
      </dl>
    )}
  </section>
);
