import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type JSHandle,
  type Page,
} from "@playwright/test";
import type { BrowserWindow } from "electron";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  createAuthHistoryFixture,
  type GitFixture,
} from "../support/git-fixture.js";
import {
  createHistoryFixture,
  type HistoryFixture,
} from "../support/history-fixture.js";

const require = createRequire(import.meta.url);
const executablePath = require("electron") as string;
const applicationPath = resolve(".webpack", "x64", "main", "index.js");

interface RunningApplication {
  readonly application: ElectronApplication;
  readonly consoleErrors: string[];
  readonly page: Page;
  readonly pageErrors: string[];
}

const fixtures: { dispose(): Promise<void> }[] = [];
const applications: ElectronApplication[] = [];
const observations: RunningApplication[] = [];

test.afterEach(async () => {
  for (const running of observations.splice(0)) {
    expect.soft(running.consoleErrors, "renderer console errors").toEqual([]);
    expect.soft(running.pageErrors, "unhandled renderer errors").toEqual([]);
  }
  for (const application of applications.splice(0)) {
    await application.close();
  }
  for (const fixture of fixtures.splice(0)) {
    await fixture.dispose();
  }
});

test("opens a repository, selects non-contiguous commits and reviews file diff", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path]);
  const browserWindow = await running.application.browserWindow(running.page) as JSHandle<BrowserWindow>;
  const baselineZoom = await normalizeDisplayScale(browserWindow);
  await setViewportSize(running.page, 1280, 720);

  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: docs(auth): explain session lifecycle",
  }).check();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(auth): validate login request",
  }).check();
  await expect(
    running.page.getByRole("region", { name: "Commit Timeline" }).getByText("2 selected"),
  ).toBeVisible();

  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
  await running.page.getByRole("button", {
    name: /View file: src\/auth\/login\.ts/u,
  }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: src/auth/login.ts · base and selected result",
  })).toBeVisible();
  await running.page.getByRole("button", { name: /View file: docs\/auth\.md/u }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: docs/auth.md · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText(
    "Base on the left · selected result on the right",
  )).toBeVisible();
  const selectedFile = running.page.getByRole("button", {
    name: /Currently viewing file: docs\/auth\.md/u,
  });
  await expect(selectedFile).toHaveAttribute("aria-pressed", "true");
  await running.page.screenshot({
    path: test.info().outputPath("list-view-1280x720.png"),
    fullPage: true,
    scale: "css",
  });

  await running.page.getByRole("button", { name: "Tree View" }).click();
  await expect(running.page.getByRole("button", { name: "Tree View" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(selectedFile).toHaveAttribute("aria-pressed", "true");
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: docs/auth.md · base and selected result",
  })).toBeVisible();
  await running.page.screenshot({
    path: test.info().outputPath("tree-view-1280x720.png"),
    fullPage: true,
    scale: "css",
  });

  await setViewportSize(running.page, 1920, 1080);
  await running.page.screenshot({
    path: test.info().outputPath("tree-view-1920x1080.png"),
    fullPage: true,
    scale: "css",
  });
  await running.page.getByRole("button", { name: "List View" }).click();
  await expect(running.page.getByRole("button", { name: "List View" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(selectedFile).toHaveAttribute("aria-pressed", "true");
  await running.page.screenshot({
    path: test.info().outputPath("list-view-1920x1080.png"),
    fullPage: true,
    scale: "css",
  });

  await browserWindow.evaluate(
    (window, zoomFactor) => { window.webContents.setZoomFactor(zoomFactor); },
    baselineZoom * 2,
  );
  await expect.poll(() => browserWindow.evaluate((window) =>
    window.webContents.getZoomFactor(),
  )).toBeCloseTo(baselineZoom * 2);
  await expect.poll(() => running.page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
  const clippedControls = await running.page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, input, select")]
      .filter((element) => element.offsetParent !== null)
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < 0 || bounds.right > window.innerWidth;
      })
      .map((element) => element.getAttribute("aria-label") ?? element.textContent.trim()),
  );
  expect(clippedControls).toEqual([]);
  await running.page.screenshot({
    path: test.info().outputPath("list-view-200-percent.png"),
    fullPage: true,
    scale: "css",
  });

  expect(await running.page.evaluate(() => typeof process)).toBe("undefined");
  expect(running.consoleErrors).toEqual([]);
  expect(running.pageErrors).toEqual([]);
});

test("cancels a calculation and can start it again", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path], {
    PRETTIFER_E2E_COMPOSITION_DELAY_MS: "500",
  });
  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(auth): validate login request",
  }).check();

  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await running.page.getByRole("button", { name: "Cancel" }).click();
  await expect(running.page.getByText(
    "Calculation cancelled. You can rebuild with the current selection.",
  )).toBeVisible();
  await running.page.getByRole("button", { name: "Rebuild Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
});

test("shows an actionable Git executable error", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path], {
    PRETTIFER_E2E_GIT_PATH: "C:\\prettifer-e2e-missing\\git.exe",
  });

  await running.page.getByRole("button", { name: "Open Repository" }).click();
  await expect(running.page.getByRole("alert")).toContainText(
    "The Git executable is unavailable.",
  );
  await expect(running.page.getByRole("alert")).toContainText(
    "Install Git or check its executable path, then try again.",
  );
});

test("explains unsupported merge commits and recovers after an invalid repository", async () => {
  const fixture = await createHistoryE2eFixture();
  const invalidRepository = await createInvalidRepositoryFixture();
  const running = await launch([invalidRepository, fixture.path]);

  await running.page.getByRole("button", { name: "Open Repository" }).click();
  await expect(running.page.getByRole("alert")).toContainText(
    "The Git repository could not be opened",
  );
  await running.page.getByRole("button", { name: "Open Repository" }).click();
  await expect(repositoryPanel(running.page).getByText(fixture.path)).toBeVisible();
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();

  await expect(running.page.getByText("Merge commit · unavailable")).toBeVisible();
  await expect(running.page.getByRole("checkbox", {
    name: "Cannot include in selected result: merge: include history side branch",
  })).toBeDisabled();
});

test("replaces repository state without showing the previous repository", async () => {
  const first = await createFixture();
  const second = await createFixture();
  const running = await launch([first.path, second.path], {
    PRETTIFER_E2E_COMPOSITION_DELAY_MS: "500",
  });

  await openRepository(running.page, first.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(auth): validate login request",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await running.page.getByRole("button", { name: "Change Repository" }).click();
  await expect(repositoryPanel(running.page).getByText(second.path)).toBeVisible();
  await expect(repositoryPanel(running.page).getByText(first.path)).not.toBeVisible();
  await expect(running.page.getByText("Load a comparison range to view commits.")).toBeVisible();
  await running.page.waitForTimeout(600);
  await expect(running.page.getByText("Load a comparison range to view commits.")).toBeVisible();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).not.toBeVisible();
});

async function createFixture(): Promise<GitFixture> {
  const fixture = await createAuthHistoryFixture();
  fixtures.push(fixture);
  return fixture;
}

async function createHistoryE2eFixture(): Promise<HistoryFixture> {
  const fixture = await createHistoryFixture();
  fixtures.push(fixture);
  return fixture;
}

async function createInvalidRepositoryFixture(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "prettifer-not-repository-"));
  fixtures.push({ dispose: () => rm(path, { force: true, recursive: true }) });
  return path;
}

async function launch(
  repositoryPaths: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Promise<RunningApplication> {
  const application = await electron.launch({
    executablePath,
    args: [applicationPath],
    env: {
      ...process.env,
      PRETTIFER_E2E: "1",
      PRETTIFER_E2E_REPOSITORIES: JSON.stringify(repositoryPaths),
      ...environment,
    },
  });
  applications.push(application);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const observedWindows = new Set<Page>();
  const observeWindow = (window: Page): void => {
    if (observedWindows.has(window)) {
      return;
    }
    observedWindows.add(window);
    window.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    window.on("pageerror", (error) => { pageErrors.push(error.message); });
  };
  application.on("window", observeWindow);
  const page = await application.firstWindow();
  observeWindow(page);
  await page.waitForLoadState("domcontentloaded");
  if (await page.getByRole("heading", { name: "The app could not be displayed" }).isVisible()) {
    await page.getByRole("button", { name: "Reload App" }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: test.info().outputPath("renderer-startup-error.png") });
    throw new Error([
      "The renderer entered its startup error screen.",
      `console: ${consoleErrors.join(" | ") || "none"}`,
      `pageerror: ${pageErrors.join(" | ") || "none"}`,
      `preload API: ${await page.evaluate(() => typeof window.prettifer)}`,
    ].join("\n"));
  }
  const running = { application, consoleErrors, page, pageErrors };
  observations.push(running);
  return running;
}

async function openRepository(page: Page, repositoryPath: string): Promise<void> {
  await page.getByRole("button", { name: "Open Repository" }).click();
  await expect(repositoryPanel(page).getByText(repositoryPath)).toBeVisible();
  await expect(page.getByText("Current branch: feature/auth-session")).toBeVisible();
}

function repositoryPanel(page: Page) {
  return page.getByRole("region", { name: "Repository and comparison range" });
}

async function setViewportSize(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  const displayScale = await page.evaluate(() => window.devicePixelRatio);
  await page.setViewportSize({
    width: Math.round(width * displayScale),
    height: Math.round(height * displayScale),
  });
  await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toEqual([width, height]);
}

async function normalizeDisplayScale(
  browserWindow: JSHandle<BrowserWindow>,
): Promise<number> {
  const baselineZoom = 1;
  await browserWindow.evaluate(
    (window, zoomFactor) => { window.webContents.setZoomFactor(zoomFactor); },
    baselineZoom,
  );
  await expect.poll(() => browserWindow.evaluate((window) =>
    window.webContents.getZoomFactor(),
  )).toBeCloseTo(baselineZoom);
  return baselineZoom;
}
