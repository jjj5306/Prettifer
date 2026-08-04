import surface from "./PanelSurface.module.css";

/**
 * Adds the current-region marker to a panel's own class when the activity rail
 * points at it. The marker lives next to the shared panel surface, so every
 * panel shows the same thing and none of them defines its own version.
 */
export function panelClass(
  panel: string | undefined,
  isCurrentRegion: boolean,
): string {
  const own = panel ?? "";
  return isCurrentRegion ? `${own} ${surface.currentRegion ?? ""}`.trim() : own;
}
