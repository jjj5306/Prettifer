import { type WorkbenchRegion } from "./workbench-region.js";
import styles from "./ActivityRail.module.css";

interface ActivityRailProps {
  readonly activeRegion: WorkbenchRegion;
  readonly onActivate: (region: WorkbenchRegion) => void;
  /** Opens the Prettifer introduction, which is a screen rather than a region. */
  readonly onOpenAbout: () => void;
}

/**
 * What the rail offers. A region entry moves the workbench and can be marked as
 * the current one; a screen entry opens something over the workbench and never
 * becomes the current region. Reviewing a file, its history and its group rules
 * all start in the panels those things live in, so the rail does not repeat them.
 */
type RailEntry =
  | Readonly<{
      kind: "region";
      id: WorkbenchRegion;
      label: string;
      description: string;
      targetId: string;
    }>
  | Readonly<{ kind: "screen"; id: "about"; label: string; description: string }>;

const entries: readonly RailEntry[] = [
  {
    kind: "region",
    id: "repository",
    label: "Repository",
    description: "Choose the repository and comparison range.",
    targetId: "repository-workspace",
  },
  {
    kind: "screen",
    id: "about",
    label: "About Prettifer",
    description: "What Prettifer is, and the version you are running.",
  },
];

export const ActivityRail = ({
  activeRegion,
  onActivate,
  onOpenAbout,
}: ActivityRailProps) => (
  <nav className={styles.rail} aria-label="Workbench">
    {entries.map((entry) => {
      const isCurrent = entry.kind === "region" && entry.id === activeRegion;
      const tooltipId = `activity-rail-${entry.id}-tooltip`;
      return (
        <span key={entry.id} className={styles.railItem}>
          <button
            type="button"
            aria-label={entry.label}
            aria-describedby={tooltipId}
            aria-current={isCurrent ? "page" : undefined}
            className={isCurrent ? styles.active : undefined}
            onClick={() => {
              if (entry.kind === "screen") {
                onOpenAbout();
                return;
              }
              onActivate(entry.id);
              document.getElementById(entry.targetId)?.focus();
            }}
          >
            <RailIcon entry={entry} />
          </button>
          <span id={tooltipId} role="tooltip" className={styles.tooltip}>
            <strong>{entry.label}</strong>
            <span>{entry.description}</span>
          </span>
        </span>
      );
    })}
  </nav>
);

const RailIcon = ({ entry }: Readonly<{ entry: RailEntry }>) => (
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
    <path d={iconPath(entry)} />
  </svg>
);

function iconPath(entry: RailEntry): string {
  return entry.kind === "screen"
    // A circled mark, the shape an application's own information carries.
    ? "M12 3a9 9 0 1 0 0.01 0M12 11v6M12 7.6h.01"
    : "M3 6.5h7l2 2h9v10H3z";
}
