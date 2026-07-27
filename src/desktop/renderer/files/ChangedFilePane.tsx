import type { CompositeDiffResultDto } from "../../shared/index.js";
import styles from "./ChangedFilePane.module.css";

interface ChangedFilePaneProps {
  readonly result: CompositeDiffResultDto;
  readonly selectedFilePath: string | null;
  readonly onSelectFile: (path: string) => void;
}

export const ChangedFilePane = ({
  result,
  selectedFilePath,
  onSelectFile,
}: ChangedFilePaneProps) => {
  const sortedFiles = result.files;
  return (
    <section className={styles.panel} aria-labelledby="changed-files-heading">
      <h2 id="changed-files-heading">변경 파일</h2>
      {sortedFiles.length === 0 ? (
        <p>변경 파일이 없습니다.</p>
      ) : (
        <ul className={styles.fileList}>
          {sortedFiles.map((file) => {
            const status = statusLabel(file.status);
            const isSelected = file.path === selectedFilePath;
            return (
              <li key={file.path}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? "현재 파일 보기" : "파일 보기"}: ${file.path} (${status})`}
                  className={isSelected ? styles.selectedFile : styles.file}
                  onClick={() => { onSelectFile(file.path); }}
                >
                  <span className={styles.status}>{status}</span><span>{file.path}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

function statusLabel(status: "added" | "modified" | "deleted"): string {
  switch (status) {
    case "added":
      return "추가";
    case "modified":
      return "수정";
    case "deleted":
      return "삭제";
  }
}
