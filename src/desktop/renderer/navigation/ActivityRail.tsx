import styles from "./ActivityRail.module.css";

export type WorkbenchRegion = "repository" | "history" | "files" | "diff";

interface ActivityRailProps {
  readonly activeRegion: WorkbenchRegion;
  readonly resultAvailable: boolean;
  readonly onActivate: (region: WorkbenchRegion) => void;
}

const items: readonly Readonly<{
  id: WorkbenchRegion;
  label: string;
  targetId: string;
}>[] = [
  { id: "repository", label: "Repository", targetId: "repository-workspace" },
  { id: "history", label: "Commit History", targetId: "commit-history" },
  { id: "files", label: "Changed Files", targetId: "changed-files" },
  { id: "diff", label: "Diff Review", targetId: "diff-review" },
];

export const ActivityRail = ({
  activeRegion,
  resultAvailable,
  onActivate,
}: ActivityRailProps) => (
  <nav className={styles.rail} aria-label="Workbench">
    {items.map((item) => {
      const disabled = (item.id === "files" || item.id === "diff") && !resultAvailable;
      return (
        <button
          key={item.id}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-current={item.id === activeRegion ? "page" : undefined}
          disabled={disabled}
          className={item.id === activeRegion ? styles.active : undefined}
          onClick={() => {
            onActivate(item.id);
            focusRegion(item.targetId);
          }}
        >
          <RailIcon region={item.id} />
        </button>
      );
    })}
  </nav>
);

const RailIcon = ({ region }: Readonly<{ region: WorkbenchRegion }>) => {
  const path = iconPath(region);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
};

function iconPath(region: WorkbenchRegion): string {
  switch (region) {
    case "repository":
      return "M3 6.5h7l2 2h9v10H3z";
    case "history":
      return "M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5M12 8v4l3 2";
    case "files":
      return "M5 4h5v5H5zM14 4h5v5h-5zM9 16h6M7.5 9v4h9V9M12 13v3";
    case "diff":
      return "M4 5h6v14H4zM14 5h6v14h-6zM7 9h1M7 12h1M16 9h1M16 12h1";
  }
}

function focusRegion(targetId: string): void {
  document.getElementById(targetId)?.focus();
}
