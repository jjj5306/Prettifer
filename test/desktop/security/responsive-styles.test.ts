import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("responsive and Windows accessibility styles", () => {
  it("supports narrow layouts used at 200 percent zoom", async () => {
    const appStyles = await readFile(resolve("src/desktop/renderer/App.module.css"), "utf8");
    const historyStyles = await readFile(
      resolve("src/desktop/renderer/history/CommitHistoryPane.module.css"),
      "utf8",
    );

    expect(appStyles).toMatch(/@media \(max-width: 64rem\)/u);
    expect(appStyles).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(historyStyles).toContain("overflow: auto");
    expect(historyStyles).toContain("min-width: 0");
  });

  it("preserves focus in high contrast and reduces motion", async () => {
    const appStyles = await readFile(resolve("src/desktop/renderer/App.module.css"), "utf8");

    expect(appStyles).toContain("@media (forced-colors: active)");
    expect(appStyles).toContain("outline-color: Highlight");
    expect(appStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(appStyles).toContain("transition-duration: 0.01ms");
  });
});
