export type WorkbenchRegion =
  | "repository"
  | "history"
  | "files"
  | "fileHistory"
  | "rules"
  | "diff";

/** The panel a rail item points at. Two items can share one panel. */
export type WorkbenchPanel = "repository" | "history" | "files" | "fileHistory" | "diff";

/** Review regions that point at a selected result, which may not exist. */
export function regionNeedsResult(region: WorkbenchRegion): boolean {
  return region === "files" || region === "fileHistory" || region === "rules" || region === "diff";
}

export function regionNeedsFile(region: WorkbenchRegion): boolean {
  return region === "fileHistory";
}

/**
 * The region that is current right now. A result-only region falls back to the
 * history panel while no result exists. When that fallback has no rail entry,
 * the workbench keeps its panel marker without marking an unavailable button.
 */
export function currentRegion(
  activeRegion: WorkbenchRegion,
  resultAvailable: boolean,
  fileSelected: boolean = resultAvailable,
): WorkbenchRegion {
  return (!resultAvailable && regionNeedsResult(activeRegion)) ||
    (!fileSelected && regionNeedsFile(activeRegion))
    ? "history"
    : activeRegion;
}

/**
 * The panel to mark as current. Group Rules is a place inside the changed file
 * panel rather than a panel of its own, so it marks the same one.
 */
export function currentPanel(
  activeRegion: WorkbenchRegion,
  resultAvailable: boolean,
  fileSelected: boolean = resultAvailable,
): WorkbenchPanel {
  const region = currentRegion(activeRegion, resultAvailable, fileSelected);
  return region === "rules" ? "files" : region;
}
