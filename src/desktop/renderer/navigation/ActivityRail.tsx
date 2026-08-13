import {
  currentRegion,
  regionNeedsRange,
  regionNeedsResult,
  type WorkbenchRegion,
} from "./workbench-region.js";
import styles from "./ActivityRail.module.css";

interface ActivityRailProps {
  readonly activeRegion: WorkbenchRegion;
  readonly rangeAvailable: boolean;
  readonly resultAvailable: boolean;
  readonly onActivate: (region: WorkbenchRegion) => void;
}

const items: readonly Readonly<{
  id: WorkbenchRegion;
  label: string;
  description: string;
  unavailableDescription?: string;
  targetId: string;
}>[] = [
  {
    id: "repository",
    label: "Repository",
    description: "Choose the repository and comparison range.",
    targetId: "repository-workspace",
  },
  {
    id: "fileHistory",
    label: "File History",
    description: "Browse repository files and review each file's commit history.",
    unavailableDescription: "Load a comparison range to browse file history.",
    targetId: "file-history",
  },
  {
    id: "rules",
    label: "Group Rules",
    description: "Edit the rules used to group changed files.",
    unavailableDescription:
      "Build a selected result to edit how its changed files are grouped.",
    targetId: "changed-files",
  },
];

export const ActivityRail = ({
  activeRegion,
  rangeAvailable,
  resultAvailable,
  onActivate,
}: ActivityRailProps) => {
  const marked = currentRegion(activeRegion, resultAvailable, rangeAvailable);

  return (
    <nav className={styles.rail} aria-label="Workbench">
      {items.map((item) => {
        const disabled = (regionNeedsRange(item.id) && !rangeAvailable) ||
          (regionNeedsResult(item.id) && !resultAvailable);
        const description = disabled
          ? item.unavailableDescription ?? item.description
          : item.description;
        const tooltipId = `activity-rail-${item.id}-tooltip`;
        return (
          <span key={item.id} className={styles.railItem}>
            <button
              type="button"
              aria-label={item.label}
              aria-describedby={tooltipId}
              aria-current={item.id === marked ? "page" : undefined}
              aria-disabled={disabled || undefined}
              className={item.id === marked ? styles.active : undefined}
              onClick={() => {
                if (disabled) {
                  return;
                }
                onActivate(item.id);
                focusRegion(item.targetId);
              }}
            >
              <RailIcon region={item.id} />
            </button>
            <span id={tooltipId} role="tooltip" className={styles.tooltip}>
              <strong>{item.label}</strong>
              <span>{description}</span>
            </span>
          </span>
        );
      })}
    </nav>
  );
};

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
    case "fileHistory":
      return "M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5M12 8v4l3 2";
    // Three rules, each with its own knob: the panel's own rule list, in small.
    case "rules":
      return "M4 6h6M14 6h6M4 12h10M18 12h2M4 18h4M12 18h8"
        + "M13 6a1 1 0 1 1-2 0a1 1 0 1 1 2 0"
        + "M17 12a1 1 0 1 1-2 0a1 1 0 1 1 2 0"
        + "M11 18a1 1 0 1 1-2 0a1 1 0 1 1 2 0";
    case "diff":
      return "M4 5h6v14H4zM14 5h6v14h-6zM7 9h1M7 12h1M16 9h1M16 12h1";
  }
}

function focusRegion(targetId: string): void {
  const target = document.getElementById(targetId);
  if (target !== null) {
    target.focus();
    return;
  }
  // File History replaces the Changed Files panel, so its target is mounted by
  // the state update triggered by this click. Retry once after that render. (#14)
  window.requestAnimationFrame(() => {
    document.getElementById(targetId)?.focus();
  });
}
