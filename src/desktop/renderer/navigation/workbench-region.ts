export type WorkbenchRegion =
  | "repository"
  | "history"
  | "files"
  | "fileHistory"
  | "diff";

/** Review regions that point at a selected result, which may not exist. */
export function regionNeedsResult(region: WorkbenchRegion): boolean {
  return region === "files" || region === "fileHistory" || region === "diff";
}

export function regionNeedsFile(region: WorkbenchRegion): boolean {
  return region === "fileHistory";
}

/**
 * The region that is current right now. A result-only region falls back to the
 * commit history while no result exists, so the workbench never marks a panel the
 * user cannot reach.
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
