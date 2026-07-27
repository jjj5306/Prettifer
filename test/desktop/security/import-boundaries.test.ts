import { resolve } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: resolve(".") });

describe("desktop import boundaries", () => {
  it.each([
    ["electron", "import { ipcRenderer } from \"electron\"; void ipcRenderer;"],
    ["Node.js", "import { readFile } from \"node:fs/promises\"; void readFile;"],
    ["Git core", "import { GitCommandRunner } from \"../../git/git-command-runner.js\"; void GitCommandRunner;"],
    ["history core", "import { RepositoryHistoryService } from \"../../history/repository-history-service.js\"; void RepositoryHistoryService;"],
  ])("rejects %s imports from renderer", async (_name, source) => {
    const [result] = await eslint.lintText(source, {
      filePath: "src/desktop/renderer/App.tsx",
    });

    expect(result?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "no-restricted-imports", severity: 2 }),
    ]));
  });

  it.each([
    ["Electron", "import { app } from \"electron\"; void app;"],
    ["Node.js", "import { readFile } from \"node:fs/promises\"; void readFile;"],
    ["renderer", "import { App } from \"../renderer/App.js\"; void App;"],
  ])("rejects %s imports from shared contracts", async (_name, source) => {
    const [result] = await eslint.lintText(source, {
      filePath: "src/desktop/shared/desktop-api.ts",
    });

    expect(result?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "no-restricted-imports", severity: 2 }),
    ]));
  });

  it.each([
    ["Node.js", "import { readFile } from \"node:fs/promises\"; void readFile;"],
    ["main", "import { createMainWindowOptions } from \"../main/window-security.js\"; void createMainWindowOptions;"],
    ["Git core", "import { GitCommandRunner } from \"../../git/git-command-runner.js\"; void GitCommandRunner;"],
  ])("rejects %s imports from preload", async (_name, source) => {
    const [result] = await eslint.lintText(source, {
      filePath: "src/desktop/preload/index.ts",
    });

    expect(result?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "no-restricted-imports", severity: 2 }),
    ]));
  });

  it.each([
    ["preload", "import { createDesktopApi } from \"../preload/desktop-api.js\"; void createDesktopApi;"],
    ["renderer", "import { App } from \"../renderer/App.js\"; void App;"],
  ])("rejects %s imports from main", async (_name, source) => {
    const [result] = await eslint.lintText(source, {
      filePath: "src/desktop/main/index.ts",
    });

    expect(result?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "no-restricted-imports", severity: 2 }),
    ]));
  });
});
