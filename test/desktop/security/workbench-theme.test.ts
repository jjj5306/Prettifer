import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("desktop workbench theme", () => {
  it("defines the workbench color tokens in one renderer theme", async () => {
    const styles = await readFile(
      resolve("src/desktop/renderer/App.module.css"),
      "utf8",
    );

    expect(styles).toContain("--color-background: #111317");
    expect(styles).toContain("--color-panel: #171a1f");
    expect(styles).toContain("--color-border: #2b3038");
    expect(styles).toContain("--color-accent: #8f80fa");
    expect(styles).toContain("--color-focus: #c7bfff");
    expect(styles).toContain("--color-added: #5bb98c");
    expect(styles).toContain("--color-deleted: #e06c75");
    expect(styles).toContain("--color-modified: #f9bc45");
  });
});
