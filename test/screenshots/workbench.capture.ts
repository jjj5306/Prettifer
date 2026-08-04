/**
 * Regenerates the README screen reference images.
 *
 * This is a tool, not a check: it drives the packaged application to each view
 * and writes `docs/assets/`. It is kept out of the end-to-end suite so a normal
 * test run never rewrites committed images.
 *
 *   npm run screenshots
 */
import {
  _electron as electron,
  expect,
  test,
  type JSHandle,
  type Page,
} from "@playwright/test";
import type { BrowserWindow } from "electron";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { createAuthHistoryFixture } from "../support/git-fixture.js";

const require = createRequire(import.meta.url);
const executablePath = require("electron") as string;
const applicationPath = resolve(".webpack", "x64", "main", "index-e2e.js");

/** The geometry the committed images already use, so the README table lines up. */
const VIEWPORT = { width: 1600, height: 1280 };

const assets = (name: string): string =>
  resolve("docs", "assets", `prettifer-desktop-workbench-${name}.png`);

test("captures the four changed file views", async () => {
  const fixture = await createAuthHistoryFixture();
  const application = await electron.launch({
    executablePath,
    args: [applicationPath],
    env: {
      ...process.env,
      PRETTIFER_E2E: "1",
      PRETTIFER_E2E_REPOSITORIES: JSON.stringify([fixture.path]),
    },
  });

  try {
    const page = await application.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    const browserWindow = await application.browserWindow(page) as JSHandle<BrowserWindow>;
    await sizeWindow(browserWindow, page);

    await page.getByRole("button", { name: "Open Repository" }).click();
    await expect(page.getByText(fixture.path, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Load Commit Range" }).click();
    await page.getByRole("checkbox", {
      name: "Include in selected result: docs(auth): explain session lifecycle",
    }).check();
    await page.getByRole("checkbox", {
      name: "Include in selected result: feat(auth): validate login request",
    }).check();
    await page.getByRole("button", { name: "Build Selected Result" }).click();
    await expect(page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
    await page.getByRole("button", {
      name: /View file: src\/auth\/login\.ts/u,
    }).click();
    await expect(page.getByText("Loading diff editor…")).toBeHidden();

    await capture(page, "list-view", "List View");
    await capture(page, "tree-view", "Tree View");

    // Config View needs a rule before it has anything to show.
    await page.getByRole("button", { name: "Config View" }).click();
    await page.getByRole("button", { name: "Add a rule" }).click();
    await page.getByLabel("Path prefix").fill("src/auth");
    await page.getByLabel("Group name").fill("Auth code");
    await page.getByRole("button", { name: "Add rule" }).click();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("button", { name: /^Auth code, / })).toBeVisible();
    await page.screenshot({ path: assets("config-view") });

    await capture(page, "full-tree", "Full Tree");
  } finally {
    await application.close();
    await fixture.dispose();
  }
});

async function capture(page: Page, name: string, toggle: string): Promise<void> {
  await page.getByRole("button", { name: toggle }).click();
  await expect(page.getByRole("button", { name: toggle }))
    .toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: assets(name) });
}

/**
 * Puts the window at the size the committed images use. The zoom factor is reset
 * so one CSS pixel is one image pixel and the review area is wide enough that
 * the diff is not cut off at the right edge.
 */
async function sizeWindow(
  browserWindow: JSHandle<BrowserWindow>,
  page: Page,
): Promise<void> {
  await browserWindow.evaluate((window, viewport) => {
    window.webContents.setZoomFactor(1);
    window.setContentSize(viewport.width, viewport.height);
  }, VIEWPORT);
  await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([VIEWPORT.width, VIEWPORT.height]);
}
