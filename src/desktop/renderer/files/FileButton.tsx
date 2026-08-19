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
  // A renamed file is one row at its current path, so the path it moved from is
  // only reachable from the row itself.
  const movedFrom = previousPathOf(entry);
  const moved = movedFrom === null ? "" : ` from ${movedFrom}`;

  return (
    <button
      type="button"
      title={fileTitle(path, movedFrom, ruleDescription)}
      aria-pressed={isSelected}
      aria-label={
        `${isSelected ? "Currently viewing" : "View"} file: ${path} `
        + `(${status.label}${moved})${rule}`
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
      <PathLabel label={label} />
    </button>
  );
};

/**
 * A row's label. Deep repositories share long folder prefixes, so the file name
 * and the folder holding it stay whole and only the folders above them give way:
 * a column of rows that all read `bundles/com.codescroll…` says nothing about
 * which file each row is.
 */
const PathLabel = ({ label }: Readonly<{ label: string }>) => {
  const parts = splitPath(label);
  if (parts === null) {
    return <span className={styles.path}>{label}</span>;
  }
  return (
    <span className={styles.filePath}>
      <span className={styles.pathAncestors}>{parts.ancestors}</span>
      <span className={styles.pathName}>{parts.folder}{parts.name}</span>
    </span>
  );
};

/**
 * Splits a path into the folders that may be shortened, the folder the file sits
 * in and the file name. Null for a label that is already a single name.
 */
function splitPath(label: string): Readonly<{
  ancestors: string;
  folder: string;
  name: string;
}> | null {
  const nameStart = label.lastIndexOf("/");
  if (nameStart < 0) {
    return null;
  }
  const folderStart = label.lastIndexOf("/", nameStart - 1);
  return {
    ancestors: label.slice(0, folderStart + 1),
    folder: label.slice(folderStart + 1, nameStart + 1),
    name: label.slice(nameStart + 1),
  };
}

type ReviewStatus = "added" | "modified" | "deleted" | "renamed" | "problem";

function entryStatus(entry: ReviewEntry): ReviewStatus {
  return entry.kind === "problem" ? "problem" : entry.file.status;
}

/** The path a renamed file had at the base, or null for every other entry. */
function previousPathOf(entry: ReviewEntry): string | null {
  return entry.kind === "problem" || entry.file.status !== "renamed"
    ? null
    : entry.file.previousPath;
}

function fileTitle(
  path: string,
  movedFrom: string | null,
  ruleDescription: string | undefined,
): string {
  const notes = [
    ...(movedFrom === null ? [] : [`renamed from ${movedFrom}`]),
    ...(ruleDescription === undefined ? [] : [ruleDescription]),
  ];
  return notes.length === 0 ? path : `${path} (${notes.join(", ")})`;
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
    case "renamed":
      return { code: "R", label: "Renamed" };
    case "problem":
      return { code: "!", label: "Problem" };
  }
}
