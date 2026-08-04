import styles from "./ChangedFilePane.module.css";

/**
 * Rules are filed under the repository root path, so a repository moved or
 * cloned elsewhere starts with none. Saying which path they belong to, and that
 * they live outside the repository, makes that answerable instead of surprising.
 */
export const RuleLocationNote = ({
  repositoryPath,
}: Readonly<{ repositoryPath: string }>) => (
  <p className={styles.empty}>
    Rules are kept in the Prettifer settings for{" "}
    <span className={styles.rulePrefix}>{repositoryPath}</span>, not in the repository.
  </p>
);
