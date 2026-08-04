import type { ReviewEntry } from "./review-entries.js";
import styles from "./ChangedFilePane.module.css";

interface FileButtonProps {
  readonly entry: ReviewEntry;
  readonly label: string;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
  /**
   * Which rule put the file where it is. Config View passes it so the applied
   * rule is readable without leaving the row; the other views have no rule.
   */
  readonly ruleDescription?: string;
}

export const FileButton = ({
  entry,
  label,
  selectedFilePath,
  onSelectFile,
  ruleDescription,
}: FileButtonProps) => {
  const path = entry.path;
  const status = fileStatus(entryStatus(entry));
  const isSelected = path === selectedFilePath;
  const rule = ruleDescription === undefined ? "" : `, ${ruleDescription}`;

  return (
    <button
      type="button"
      title={ruleDescription === undefined ? path : `${path} (${ruleDescription})`}
      aria-pressed={isSelected}
      aria-label={
        `${isSelected ? "Currently viewing" : "View"} file: ${path} (${status.label})${rule}`
      }
      className={isSelected ? styles.selectedFile : styles.file}
      onClick={() => { onSelectFile(path); }}
    >
      <span
        className={`${styles.status} ${styles[entryStatus(entry)]}`}
        aria-hidden="true"
      >
        {status.code}
      </span>
      <span className={styles.path}>{label}</span>
    </button>
  );
};

type ReviewStatus = "added" | "modified" | "deleted" | "problem";

function entryStatus(entry: ReviewEntry): ReviewStatus {
  return entry.kind === "problem" ? "problem" : entry.file.status;
}

function fileStatus(
  status: ReviewStatus,
): Readonly<{ code: string; label: string }> {
  switch (status) {
    case "added":
      return { code: "A", label: "Added" };
    case "modified":
      return { code: "M", label: "Modified" };
    case "deleted":
      return { code: "D", label: "Deleted" };
    case "problem":
      return { code: "!", label: "Problem" };
  }
}
