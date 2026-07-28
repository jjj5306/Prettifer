import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

async function readStyles(relativePath: string): Promise<string> {
  return readFile(resolve("src/desktop/renderer", relativePath), "utf8");
}

describe("workbench layout styles", () => {
  it("keeps the diff editor in the flexible row of its panel", async () => {
    const styles = await readStyles("diff/DiffPane.module.css");

    expect(styles).toMatch(/\.panel\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\);/u);
    // Without an explicit row the host lands in an auto row and stops growing.
    expect(styles).toMatch(/\.editorHost\s*\{[^}]*grid-row:\s*3;/u);
    expect(styles).toMatch(/\.editorHost\s*\{[^}]*height:\s*100%;/u);
  });

  it("paints every line of an added file with the added color", async () => {
    const styles = await readStyles("diff/DiffPane.module.css");

    expect(styles).toContain(":global(.prettifer-added-line)");
  });

  it("gives the app, repository, commit and result bars one shared height", async () => {
    const [app, toolbar, history, result] = await Promise.all([
      readStyles("App.module.css"),
      readStyles("repository/RepositoryToolbar.module.css"),
      readStyles("history/CommitHistoryPane.module.css"),
      readStyles("composition/CompositeResultHeader.module.css"),
    ]);

    expect(app).toContain("--bar-height: 3rem");
    expect(app).toMatch(/\.appHeader\s*\{[^}]*min-height:\s*var\(--bar-height\);/u);
    expect(app).toContain("grid-template-rows: var(--bar-height) minmax(0, 1fr)");
    expect(toolbar).toMatch(/\.toolbar\s*\{[^}]*min-height:\s*var\(--bar-height\);/u);
    expect(history).toMatch(/\.readyPanel\s*\{[^}]*min-height:\s*var\(--bar-height\);/u);
    expect(result).toMatch(/\.header\s*\{[^}]*min-height:\s*var\(--bar-height\);/u);
    // A single-line commit card is what lets the commit bar match the others.
    expect(history).toMatch(/\.commitButton\s*\{[^}]*display:\s*flex;/u);
  });

  it("gives the review pane splitter its own column and hides it when stacked", async () => {
    const [app, splitter] = await Promise.all([
      readStyles("App.module.css"),
      readStyles("layout/PaneSplitter.module.css"),
    ]);

    expect(app).toContain(
      "grid-template-columns: var(--changed-files-width, 18rem) auto minmax(0, 1fr)",
    );
    expect(splitter).toMatch(/cursor:\s*col-resize;/u);
    expect(splitter).toMatch(/@media \(max-width: 64rem\)[\s\S]*?display:\s*none;/u);
    expect(splitter).toMatch(/@media \(forced-colors: active\)/u);
  });

  it("ends the Tree View guide with a connector beside each row", async () => {
    const styles = await readStyles("files/ChangedFilePane.module.css");

    expect(styles).not.toContain("border-left: 1px solid var(--color-border)");
    expect(styles).toMatch(/\.tree \.tree > li::before\s*\{[^}]*width:\s*1px;/u);
    expect(styles).toMatch(/\.tree \.tree > li::after\s*\{[^}]*height:\s*1px;/u);
    expect(styles).toMatch(
      /\.tree \.tree > li:last-child::before\s*\{[^}]*height:\s*var\(--tree-row-center\);/u,
    );
  });
});
