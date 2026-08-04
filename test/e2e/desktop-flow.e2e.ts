import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type JSHandle,
  type Locator,
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
import {
  createMergeFixture,
  type MergeFixture,
} from "../support/merge-fixture.js";
import {
  createConflictFixture,
  type ConflictFixture,
} from "../support/conflict-fixture.js";
import {
  createSymbolFixture,
  type SymbolFixture,
} from "../support/symbol-fixture.js";

const require = createRequire(import.meta.url);
const executablePath = require("electron") as string;
// The end-to-end entry, which accepts the PRETTIFER_E2E_* seams. The production
// entry has none of them and is what the package smoke test exercises.
const applicationPath = resolve(".webpack", "x64", "main", "index-e2e.js");

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
  // The commit card selects too, so one of the two goes through the card.
  const loginCommitCard = running.page.getByRole("button", {
    name: /^Include in selected result: feat\(auth\): validate login request ·/u,
  });
  await loginCommitCard.click();
  await expect(loginCommitCard).toHaveAttribute("aria-pressed", "true");
  await expect(
    running.page.getByRole("region", { name: "Commit History" }).getByText("2 selected"),
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
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();
  // The heading names the file under review, which symbol navigation changes.
  await expect(reviewedPath(running.page, "docs/auth.md")).toBeVisible();
  const selectedFile = running.page.getByRole("button", {
    name: /Currently viewing file: docs\/auth\.md/u,
  });
  await expect(selectedFile).toHaveAttribute("aria-pressed", "true");
  await expect(running.page.getByRole("button", { name: "Changed Files" })).toBeEnabled();
  await running.page.getByRole("button", { name: "Changed Files" }).click();
  await expect(running.page.getByRole("region", { name: "Changed Files" })).toBeFocused();
  await expect(running.page.getByRole("button", { name: "Changed Files" }))
    .toHaveAttribute("aria-current", "page");
  const layout = await running.page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('nav[aria-label="Workbench"]');
    const appBar = document.querySelector<HTMLElement>("header");
    const repository = document.getElementById("repository-workspace");
    const timeline = document.getElementById("commit-history");
    const composite = document.querySelector<HTMLElement>(
      'section[aria-labelledby="composite-result-heading"]',
    );
    const diff = document.getElementById("diff-review");
    const editor = diff?.querySelector<HTMLElement>('[role="textbox"]') ?? null;
    if (
      rail === null || appBar === null || repository === null || timeline === null
      || composite === null || diff === null || editor === null
    ) {
      throw new Error("The review layout could not be measured.");
    }
    return {
      railY: rail.getBoundingClientRect().y,
      railHeight: rail.getBoundingClientRect().height,
      barHeights: [appBar, repository, timeline, composite].map((bar) =>
        Math.round(bar.getBoundingClientRect().height),
      ),
      historyHeight: timeline.getBoundingClientRect().height,
      diffHeight: diff.getBoundingClientRect().height,
      editorHeight: editor.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    };
  });
  expect(layout.railY).toBe(0);
  expect(layout.railHeight).toBeGreaterThanOrEqual(700);
  expect(layout.historyHeight).toBeLessThan(80);
  // The app, repository, commit and result bars share one height.
  expect(new Set(layout.barHeights).size).toBe(1);
  expect(layout.diffHeight).toBeGreaterThanOrEqual(layout.viewportHeight * 0.7);
  // The editor fills the panel instead of stopping at its own minimum height.
  expect(layout.editorHeight).toBeGreaterThanOrEqual(layout.diffHeight - 96);
  expect(await running.page.evaluate(() =>
    document.fonts.check('13px "Hanken Grotesk Variable"'),
  )).toBe(true);
  expect(await running.page.evaluate(() =>
    document.fonts.check('12.5px "Geist Variable"'),
  )).toBe(true);

  await running.page.getByRole("button", { name: "Tree View" }).click();
  await expect(running.page.getByRole("button", { name: "Tree View" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(selectedFile).toHaveAttribute("aria-pressed", "true");
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: docs/auth.md · base and selected result",
  })).toBeVisible();

  await setViewportSize(running.page, 1920, 1080);
  await running.page.getByRole("button", { name: "List View" }).click();
  await expect(running.page.getByRole("button", { name: "List View" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(selectedFile).toHaveAttribute("aria-pressed", "true");

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

  expect(await running.page.evaluate(() => typeof process)).toBe("undefined");
  expect(running.consoleErrors).toEqual([]);
  expect(running.pageErrors).toEqual([]);
});

test("reviews an added file as full contents and collapses its Tree View folder", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path]);
  const browserWindow = await running.application.browserWindow(running.page) as JSHandle<BrowserWindow>;
  await normalizeDisplayScale(browserWindow);
  await setViewportSize(running.page, 1280, 720);
  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: refactor(auth): extract credential helpers",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();

  await running.page.getByRole("button", {
    name: /file: src\/auth\/credentials\.ts/u,
  }).click();
  await expect(running.page.getByRole("heading", { name: "Added File" })).toBeVisible();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only added file: src/auth/credentials.ts"
      + " · full contents added by the selected result",
  })).toBeVisible();
  // The heading follows the review to the added file.
  await expect(reviewedPath(running.page, "src/auth/credentials.ts")).toBeVisible();
  await expect(reviewedPath(running.page, "docs/auth.md")).toBeHidden();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();
  await expect.poll(() => running.page.evaluate(() =>
    document.querySelectorAll(".prettifer-added-line").length,
  )).toBeGreaterThan(0);

  await running.page.getByRole("button", { name: "Tree View" }).click();
  // The single-directory chain src → auth is joined into one row.
  const authFolder = running.page.getByRole("button", { name: "src/auth", exact: true });
  await expect(authFolder).toHaveAttribute("aria-expanded", "true");
  await authFolder.click();
  await expect(authFolder).toHaveAttribute("aria-expanded", "false");
  await expect(running.page.getByRole("button", {
    name: /file: src\/auth\/credentials\.ts/u,
  })).toBeHidden();
  await authFolder.click();
  await expect(running.page.getByRole("button", {
    name: /Currently viewing file: src\/auth\/credentials\.ts/u,
  })).toBeVisible();

  expect(running.consoleErrors).toEqual([]);
  expect(running.pageErrors).toEqual([]);
});

test("sizes tree rows to their own name and keeps list rows full width", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path]);
  const browserWindow = await running.application.browserWindow(running.page) as JSHandle<BrowserWindow>;
  await normalizeDisplayScale(browserWindow);
  await setViewportSize(running.page, 1600, 900);
  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: refactor(auth): extract credential helpers",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();

  const measure = async () => running.page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("#changed-files");
    // Only the rows inside the list, never the view toggle buttons in the header.
    const rows = [...document.querySelectorAll<HTMLElement>("#changed-files ul button")];
    if (panel === null || rows.length === 0) {
      throw new Error("The changed file rows could not be measured.");
    }
    const available = panel.getBoundingClientRect().width;
    return {
      available: Math.round(available),
      widths: rows.map((row) => Math.round(row.getBoundingClientRect().width)),
      overflowing: rows.filter(
        (row) => row.getBoundingClientRect().width > available,
      ).length,
    };
  });

  // Widen the pane the way the user does, so the rows have room to stretch into.
  const splitter = running.page.getByRole("separator", { name: "Resize Changed Files" });
  await splitter.focus();
  await splitter.press("End");
  await expect.poll(async () => (await measure()).available).toBeGreaterThan(600);

  await running.page.getByRole("button", { name: "Tree View" }).click();
  await expect(running.page.getByRole("button", { name: "Tree View" }))
    .toHaveAttribute("aria-pressed", "true");
  const tree = await measure();
  // Every tree row hugs its own label instead of filling the widened panel.
  expect(Math.max(...tree.widths)).toBeLessThan(tree.available - 40);
  // A long name still stays inside the panel.
  expect(tree.overflowing).toBe(0);

  await running.page.getByRole("button", { name: "List View" }).click();
  await expect(running.page.getByRole("button", { name: "List View" }))
    .toHaveAttribute("aria-pressed", "true");
  const list = await measure();
  // The flat list keeps full-width rows, which this change must not alter.
  expect(Math.min(...list.widths)).toBeGreaterThan(list.available - 40);
});

test("resizes the changed files and diff panes and keeps the width", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path]);
  const browserWindow = await running.application.browserWindow(running.page) as JSHandle<BrowserWindow>;
  await normalizeDisplayScale(browserWindow);
  await setViewportSize(running.page, 1280, 720);
  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: docs(auth): explain session lifecycle",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();

  const measure = async () => running.page.evaluate(() => {
    const files = document.getElementById("changed-files");
    const diff = document.getElementById("diff-review");
    if (files === null || diff === null) {
      throw new Error("The review panes could not be measured.");
    }
    return {
      filesWidth: Math.round(files.getBoundingClientRect().width),
      diffWidth: Math.round(diff.getBoundingClientRect().width),
    };
  });
  const splitter = running.page.getByRole("separator", { name: "Resize Changed Files" });
  const before = await measure();
  const handle = await splitter.boundingBox();
  if (handle === null) {
    throw new Error("The splitter is not visible.");
  }

  await running.page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await running.page.mouse.down();
  await running.page.mouse.move(handle.x + 140, handle.y + handle.height / 2, { steps: 8 });
  await running.page.mouse.up();

  const widened = await measure();
  expect(widened.filesWidth).toBeGreaterThan(before.filesWidth + 100);
  expect(widened.diffWidth).toBeLessThan(before.diffWidth - 100);

  // The diff pane keeps a usable width no matter how far the splitter is dragged.
  await running.page.mouse.move(handle.x + 140, handle.y + handle.height / 2);
  await running.page.mouse.down();
  await running.page.mouse.move(1279, handle.y + handle.height / 2, { steps: 8 });
  await running.page.mouse.up();
  const clamped = await measure();
  expect(clamped.diffWidth).toBeGreaterThanOrEqual(380);

  // Keyboard control reports the same width it applies.
  await splitter.focus();
  await running.page.keyboard.press("Home");
  const narrowed = await measure();
  expect(narrowed.filesWidth).toBeLessThan(200);
  await expect(splitter).toHaveAttribute("aria-valuenow", String(narrowed.filesWidth));

  // The width survives switching the file view and reselecting a file.
  await running.page.getByRole("button", { name: "Tree View" }).click();
  await running.page.getByRole("button", { name: /file: docs\/auth\.md/u }).click();
  expect((await measure()).filesWidth).toBe(narrowed.filesWidth);

  expect(running.consoleErrors).toEqual([]);
  expect(running.pageErrors).toEqual([]);
});

test("resizes the base and result sides inside the diff", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path]);
  const browserWindow = await running.application.browserWindow(running.page) as JSHandle<BrowserWindow>;
  await normalizeDisplayScale(browserWindow);
  await setViewportSize(running.page, 1280, 720);
  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: docs(auth): explain session lifecycle",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
  await running.page.getByRole("button", { name: /file: docs\/auth\.md/u }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: docs/auth.md · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();

  const measureSides = async () => running.page.evaluate(() => {
    const editor = document.querySelector(".monaco-diff-editor");
    const original = editor?.querySelector<HTMLElement>(".editor.original");
    const modified = editor?.querySelector<HTMLElement>(".editor.modified");
    if (original === null || original === undefined
      || modified === null || modified === undefined) {
      throw new Error("The diff sides could not be measured.");
    }
    return {
      baseWidth: Math.round(original.getBoundingClientRect().width),
      resultWidth: Math.round(modified.getBoundingClientRect().width),
    };
  });
  await expect.poll(async () => (await measureSides()).baseWidth).toBeGreaterThan(0);
  const before = await measureSides();

  const sash = running.page.locator(".monaco-diff-editor .monaco-sash.vertical").first();
  const handle = await sash.boundingBox();
  if (handle === null) {
    throw new Error("The diff split sash is not available.");
  }
  const sashY = handle.y + handle.height / 2;
  await running.page.mouse.move(handle.x + handle.width / 2, sashY);
  await running.page.mouse.down();
  await running.page.mouse.move(handle.x - 160, sashY, { steps: 8 });
  await running.page.mouse.up();

  await expect.poll(async () => (await measureSides()).baseWidth)
    .toBeLessThan(before.baseWidth - 100);
  const after = await measureSides();
  expect(after.resultWidth).toBeGreaterThan(before.resultWidth + 100);

  // Moving the split does not change which file is under review.
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: docs/auth.md · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByRole("button", {
    name: /Currently viewing file: docs\/auth\.md/u,
  })).toHaveAttribute("aria-pressed", "true");

  expect(running.consoleErrors).toEqual([]);
  expect(running.pageErrors).toEqual([]);
});

test("shows progress and cancels a calculation that runs past one second", async () => {
  const fixture = await createFixture();
  // Past the one second the spec uses as the progress threshold.
  const running = await launch([fixture.path], {
    PRETTIFER_E2E_COMPOSITION_DELAY_MS: "1200",
  });
  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(auth): validate login request",
  }).check();

  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(
    running.page.getByRole("region", { name: "Selected Result" })
      .getByText("Building selected result…"),
  ).toBeVisible();
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

test("offers merge commit selection and recovers after an invalid repository", async () => {
  const fixture = await createHistoryE2eFixture();
  const invalidRepository = await createInvalidRepositoryFixture();
  const running = await launch([invalidRepository, fixture.path]);

  await running.page.getByRole("button", { name: "Open Repository" }).click();
  await expect(running.page.getByRole("alert")).toContainText(
    "The Git repository could not be opened",
  );
  await running.page.getByRole("button", { name: "Open Repository" }).click();
  await expect(running.page.getByText(fixture.path, { exact: true })).toBeVisible();
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();

  await expect(running.page.getByRole("checkbox", {
    name: "Include in selected result: merge: include history side branch",
  })).toBeEnabled();
  await expect(running.page.getByRole("combobox", {
    name: "Mainline parent for merge commit: merge: include history side branch",
  })).toBeVisible();
});

test("keeps a merge commit card inside the commit history bar", async () => {
  const fixture = await createMergeE2eFixture();
  const running = await launch([fixture.path]);
  const browserWindow = await running.application.browserWindow(running.page) as JSHandle<BrowserWindow>;
  await normalizeDisplayScale(browserWindow);
  await setViewportSize(running.page, 1280, 720);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();

  // The merge commit carries a mainline parent picker, which must not push the
  // card past the shared bar height where the list clips it vertically.
  const picker = running.page.getByRole("combobox", {
    name: "Mainline parent for merge commit: merge: include side one",
  });
  await expect(picker).toBeVisible();

  const fit = await running.page.evaluate(() => {
    const list = document.querySelector<HTMLElement>("#commit-history ol");
    const select = document.querySelector<HTMLElement>("#commit-history select");
    const row = select?.closest("li");
    if (list === null || select === null || row === null || row === undefined) {
      throw new Error("The merge commit card could not be measured.");
    }
    const listBox = list.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const selectBox = select.getBoundingClientRect();
    return {
      listHeight: Math.round(listBox.height),
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      rowHeight: Math.round(rowBox.height),
      rowOverflowBelow: Math.round(rowBox.bottom - listBox.bottom),
      selectOverflowBelow: Math.round(selectBox.bottom - listBox.bottom),
      // Every card shares the bar, so a commit without a picker must fit too.
      plainRowOverflowBelow: (() => {
        const rows = [...list.querySelectorAll("li")]
          .filter((candidate) => candidate.querySelector("select") === null);
        const plain = rows[0];
        if (plain === undefined) { return -1; }
        return Math.round(plain.getBoundingClientRect().bottom - listBox.bottom);
      })(),
    };
  });
  // The card and its picker stay within the list box instead of being cut off.
  expect(fit.rowOverflowBelow).toBeLessThanOrEqual(0);
  expect(fit.selectOverflowBelow).toBeLessThanOrEqual(0);
  expect(fit.plainRowOverflowBelow).toBeLessThanOrEqual(0);
  expect(fit.listScrollHeight).toBeLessThanOrEqual(fit.listClientHeight);
});

test("composes a merge commit against the chosen mainline parent", async () => {
  const fixture = await createMergeE2eFixture();
  const running = await launch([fixture.path]);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();

  const mergeTitle = "merge: include side one";
  await running.page.getByRole("checkbox", {
    name: `Include in selected result: ${mergeTitle}`,
  }).check();

  // Until the mainline parent is chosen the result cannot be built.
  await expect(running.page.getByText(
    "Choose a mainline parent for the selected merge commit.",
  )).toBeVisible();
  await expect(
    running.page.getByRole("button", { name: "Build Selected Result" }),
  ).toBeDisabled();

  const picker = running.page.getByRole("combobox", {
    name: `Mainline parent for merge commit: ${mergeTitle}`,
  });
  await expect(picker).toHaveAttribute("aria-invalid", "true");
  await picker.selectOption("1");
  await expect(picker).not.toHaveAttribute("aria-invalid", "true");

  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
  // Parent 1 is the working branch, so the merge brings in the side branch file.
  await expect(running.page.getByRole("button", {
    name: /file: side-one\.txt/u,
  })).toBeVisible();
  await expect(
    running.page.getByRole("region", { name: "Selected Result" }).getByText("parent 1"),
  ).toBeVisible();

  // Choosing the other parent composes the other side of the merge.
  await picker.selectOption("2");
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
  await expect(running.page.getByRole("button", {
    name: /file: mainline\.txt/u,
  })).toBeVisible();
  await expect(
    running.page.getByRole("region", { name: "Selected Result" }).getByText("parent 2"),
  ).toBeVisible();

  expect(running.consoleErrors).toEqual([]);
  expect(running.pageErrors).toEqual([]);
});

test("reviews a partial result and jumps to its problem file", async () => {
  const fixture = await createConflictE2eFixture();
  const running = await launch([fixture.path]);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();

  // The prerequisite commit stays unselected, so shared.txt cannot be composed
  // while the same commit's clean.txt change still applies.
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat: rewrite the first shared line again and extend clean",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();

  const result = running.page.getByRole("region", { name: "Selected Result" });
  await expect(result.getByText("Partial result")).toBeVisible();
  await expect(result.getByText(
    "1 file needs a content choice and was left at the comparison base.",
  )).toBeVisible();
  // The clean change of the partially applied commit is still reviewable, and
  // the problem file is listed beside it instead of being dropped.
  await expect(running.page.getByRole("button", {
    name: "Currently viewing file: clean.txt (Modified)",
  })).toBeVisible();
  await expect(running.page.getByRole("button", {
    name: "View file: shared.txt (Problem)",
  })).toBeVisible();

  await result.getByRole("button", { name: "Review first problem file" }).click();
  await expect(running.page.getByRole("heading", { name: "Problem File" })).toBeVisible();
  await expect(running.page.getByText("This file needs a content choice")).toBeVisible();
  await expect(running.page.getByRole("button", {
    name: "Currently viewing file: shared.txt (Problem)",
  })).toHaveAttribute("aria-pressed", "true");

  // Returning to a composed file shows a diff again.
  await running.page.getByRole("button", { name: "View file: clean.txt (Modified)" }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: clean.txt · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();

  // The user repository keeps its own working tree and branch.
  expect(fixture.git(["status", "--porcelain"])).toBe("");
  expect(fixture.git(["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe(fixture.headRef);
});

test("switches the diff between side-by-side and inline without losing the place", async () => {
  const fixture = await createSymbolE2eFixture();
  const running = await launch([fixture.path]);
  await setViewportSize(running.page, 1280, 900);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(app): call UtVar from Caller",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: src/app/Caller.java · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();

  /*
   * Side by side is where a reader starts. Monaco marks that layout with its own
   * `side-by-side` class on the diff editor and drops it for the inline flow.
   */
  const sideBySide = running.page.getByRole("button", { name: "Side-by-side" });
  const inline = running.page.getByRole("button", { name: "Inline" });
  const splitPanes = running.page.locator(".monaco-diff-editor.side-by-side");
  await expect(sideBySide).toHaveAttribute("aria-pressed", "true");
  await expect(splitPanes).toHaveCount(1);

  const reviewed = running.page.locator(".monaco-diff-editor .modified");
  await reviewed.locator(".view-lines").hover();
  const topLine = reviewed.locator(".margin-view-overlays .line-numbers").first();
  await expect.poll(async () => {
    await running.page.mouse.wheel(0, 600);
    return Number(await topLine.innerText());
  }).toBeGreaterThan(10);
  const scrolledTo = await topLine.innerText();

  await inline.click();

  await expect(inline).toHaveAttribute("aria-pressed", "true");
  await expect(sideBySide).toHaveAttribute("aria-pressed", "false");
  // One flow instead of two panes, and the same place in the file.
  await expect(splitPanes).toHaveCount(0);
  await expect(topLine).toHaveText(scrolledTo);

  await inline.press("Enter");
  await expect(inline).toHaveAttribute("aria-pressed", "true");
  await sideBySide.press("Enter");
  await expect(sideBySide).toHaveAttribute("aria-pressed", "true");
  await expect(splitPanes).toHaveCount(1);
  expect(fixture.git(["status", "--porcelain"])).toBe("");
});

test("navigates from a reviewed file to a declaration outside the result and back", async () => {
  const fixture = await createSymbolE2eFixture();
  const running = await launch([fixture.path]);
  await setViewportSize(running.page, 1280, 900);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(app): call UtVar from Caller",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: src/app/Caller.java · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();

  /*
   * Two places name the type on their own: the import, and the construction on
   * `UtVar counter = new UtVar();`. Monaco renders the rest of the type uses
   * inside wider tokens, so these two are the ones a test can point at.
   */
  const reviewed = running.page.locator(".monaco-diff-editor .modified");
  // Monaco keeps the space before a token inside that token's span, so the
  // pattern allows it.
  const names = reviewed.locator("span", { hasText: /^\s*UtVar\s*$/u });
  const inImport = names.first();
  await expect(inImport).toBeVisible();

  // Holding Ctrl over an identifier says it can be followed, before any click.
  await running.page.keyboard.down("Control");
  await inImport.hover();
  await expect(reviewed.locator(".prettifer-symbol-link")).toHaveCount(1);
  await running.page.keyboard.up("Control");
  await expect(reviewed.locator(".prettifer-symbol-link")).toHaveCount(0);

  // Not a construction, so this goes straight to the class, not to a constructor.
  await inImport.click({ modifiers: ["Control"] });

  await expect(running.page.getByRole("heading", {
    name: "Outside the Selected Result",
  })).toBeVisible();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only file outside the selected result: src/model/UtVar.java · contents at the comparison base",
  })).toBeVisible();
  await expect(reviewedPath(running.page, "src/model/UtVar.java")).toBeVisible();
  // The declaration line is marked, so the arrival is shown rather than implied.
  await expect(running.page.locator(".prettifer-target-line").first()).toBeVisible();

  // The way back returns to the reviewed diff.
  await running.page.getByRole("button", { name: "Back" }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: src/app/Caller.java · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByRole("button", { name: "Back" })).toBeHidden();

  // The user repository is untouched by the search and by the navigation.
  expect(fixture.git(["status", "--porcelain"])).toBe("");
  expect(fixture.git(["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe(fixture.headRef);
});

test("keeps the review scrolled where it was when a lookup starts", async () => {
  const fixture = await createSymbolE2eFixture();
  const running = await launch([fixture.path]);
  await setViewportSize(running.page, 1280, 900);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(app): call UtVar from Caller",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: src/app/Caller.java · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();

  const reviewed = running.page.locator(".monaco-diff-editor .modified");
  const token = reviewed.locator("span", { hasText: /^total$/u }).first();
  await expect(token).toBeVisible();
  // The cursor stays on the symbol while the view scrolls away from it.
  await token.click();
  await reviewed.locator(".view-lines").hover();
  const topLine = reviewed.locator(".margin-view-overlays .line-numbers").first();
  // Far enough down that a reset to the top is unmistakable.
  await expect.poll(async () => {
    await running.page.mouse.wheel(0, 600);
    return Number(await topLine.innerText());
  }).toBeGreaterThan(10);
  const scrolledTo = await topLine.innerText();

  await running.page.keyboard.press("Shift+F12");
  await expect(running.page.getByRole("heading", { name: "References to total" }))
    .toBeVisible();

  // The lookup rebuilt no editor, so the review is where the user left it.
  await expect(reviewed.locator(".margin-view-overlays .line-numbers").first())
    .toHaveText(scrolledTo);
});

test("offers the constructors where an object is made, not the class line", async () => {
  const fixture = await createSymbolE2eFixture();
  const running = await launch([fixture.path]);
  await setViewportSize(running.page, 1280, 900);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(app): call UtVar from Caller",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: src/app/Caller.java · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();

  const reviewed = running.page.locator(".monaco-diff-editor .modified");
  // The import names the type; the second standalone name is the one after `new`.
  const constructed = reviewed.locator("span", { hasText: /^\s*UtVar\s*$/u }).nth(1);
  await expect(constructed).toBeVisible();

  await constructed.click({ modifiers: ["Control"] });

  // Two constructors are a real choice, so they are listed; the class line is not.
  const matches = running.page.getByRole("list", { name: "Symbol matches" });
  await expect(running.page.getByRole("heading", { name: "Declarations of UtVar" }))
    .toBeVisible();
  await expect(matches.getByRole("button", { name: /src\/model\/UtVar\.java:6/u })).toBeVisible();
  await expect(matches.getByRole("button", { name: /src\/model\/UtVar\.java:10/u })).toBeVisible();
  await expect(matches.getByRole("button", { name: /src\/model\/UtVar\.java:3/u })).toBeHidden();
  // Each entry says what kind of declaration it is.
  await expect(matches.getByRole("button", { name: /ctor/u }).first()).toBeVisible();

  await matches.getByRole("button", { name: /src\/model\/UtVar\.java:10/u }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only file outside the selected result: src/model/UtVar.java · contents at the comparison base",
  })).toBeVisible();
  expect(fixture.git(["status", "--porcelain"])).toBe("");
});

test("lists the references of a symbol and moves to the chosen one", async () => {
  const fixture = await createSymbolE2eFixture();
  const running = await launch([fixture.path]);
  await setViewportSize(running.page, 1280, 900);
  await openRepository(running.page, fixture.path, fixture.headRef);
  await running.page.getByRole("button", { name: "Load Commit Range" }).click();
  await running.page.getByRole("checkbox", {
    name: "Include in selected result: feat(app): call UtVar from Caller",
  }).check();
  await running.page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only diff: src/app/Caller.java · base and selected result",
  })).toBeVisible();
  await expect(running.page.getByText("Loading diff editor…")).toBeHidden();

  const reviewed = running.page.locator(".monaco-diff-editor .modified");
  const token = reviewed.locator("span", { hasText: /^total$/u }).first();
  await expect(token).toBeVisible();
  await token.click();
  await running.page.keyboard.press("Shift+F12");

  const matches = running.page.getByRole("list", { name: "Symbol matches" });
  await expect(running.page.getByRole("heading", { name: "References to total" })).toBeVisible();
  // The declaration in the unchanged file and the call in the reviewed file.
  await expect(matches.getByRole("button", { name: /src\/model\/UtVar\.java:14/u })).toBeVisible();
  await expect(matches.getByRole("button", { name: /src\/app\/Caller\.java:8/u })).toBeVisible();

  await matches.getByRole("button", { name: /src\/model\/UtVar\.java:14/u }).click();
  await expect(running.page.getByRole("textbox", {
    name: "Read-only file outside the selected result: src/model/UtVar.java · contents at the comparison base",
  })).toBeVisible();
  expect(fixture.git(["status", "--porcelain"])).toBe("");
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
  await expect(running.page.getByText(second.path, { exact: true })).toBeVisible();
  await expect(running.page.getByText(first.path, { exact: true })).not.toBeVisible();
  await expect(running.page.getByText("Load a comparison range to view commits.")).toBeVisible();
  await running.page.waitForTimeout(600);
  await expect(running.page.getByText("Load a comparison range to view commits.")).toBeVisible();
  await expect(running.page.getByText(/Result ready · \d+ changed files/u)).not.toBeVisible();
});

test("groups changed files by a saved rule and restores the rule after a restart", async () => {
  const fixture = await createFixture();
  const settingsPath = await createSettingsDirectory();
  const before = await fixture.snapshotWorktree();

  const first = await launch([fixture.path], {}, settingsPath);
  await composeAuthResult(first.page, fixture.path);
  await first.page.getByRole("button", { name: "Config View" }).click();

  await expect(first.page.getByText("No group rules for this repository yet.")).toBeVisible();
  await first.page.getByRole("button", { name: "Add a rule" }).click();
  await first.page.getByLabel("Path prefix").fill("src/auth");
  await first.page.getByLabel("Group name").fill("Auth code");
  await first.page.getByRole("button", { name: "Add rule" }).click();

  const authGroup = /^Auth code, rule src\/auth to Auth code, \d+ files$/u;
  await expect(first.page.getByRole("button", { name: authGroup })).toBeVisible();
  await expect(first.page.getByRole("button", { name: /^Ungrouped, no rule matched/u }))
    .toBeVisible();
  await expect(first.page.getByRole("button", {
    name: /View file: src\/auth\/login\.ts .*rule src\/auth to Auth code/u,
  })).toBeVisible();
  await closeApplication(first.application);

  const second = await launch([fixture.path], {}, settingsPath);
  await composeAuthResult(second.page, fixture.path);
  await second.page.getByRole("button", { name: "Config View" }).click();

  await expect(second.page.getByRole("button", { name: authGroup })).toBeVisible();
  await expect(second.page.getByText("No group rules for this repository yet.")).toBeHidden();
  // Rules live in the application settings, so the repository is left as it was.
  expect(await fixture.snapshotWorktree()).toEqual(before);
});

test("opens the group rule editor from the activity rail", async () => {
  const fixture = await createFixture();
  const settingsPath = await createSettingsDirectory();
  const running = await launch([fixture.path], {}, settingsPath);
  await composeAuthResult(running.page, fixture.path);

  // Start in List View, the default, so the rail has to switch the view too.
  await expect(running.page.getByRole("button", { name: "List View" }))
    .toHaveAttribute("aria-pressed", "true");
  await running.page.getByRole("button", { name: "Group Rules" }).click();

  await expect(running.page.getByRole("button", { name: "Config View" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(running.page.getByRole("region", { name: "Group rules" })).toBeVisible();
  await running.page.getByLabel("Path prefix").fill("src/auth");
  await running.page.getByLabel("Group name").fill("Auth code");
  await running.page.getByRole("button", { name: "Add rule" }).click();

  await expect(running.page.getByRole("button", {
    name: /^Auth code, rule src\/auth to Auth code, \d+ files$/u,
  })).toBeVisible();
});

test("shows which region the activity rail moved to after a mouse click", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path]);
  await composeAuthResult(running.page, fixture.path);

  const history = running.page.getByRole("region", { name: "Commit History" });
  const before = await borderColorOf(history);
  // A plain click, which is the case that used to change nothing on screen.
  await running.page.getByRole("button", { name: "Commit History" }).click();

  await expect.poll(() => borderColorOf(history)).not.toBe(before);
  await expect(running.page.getByRole("button", { name: "Commit History" }))
    .toHaveAttribute("aria-current", "page");

  // Moving focus elsewhere leaves the marker where the rail points.
  await running.page.getByRole("button", { name: "Change Repository" }).focus();
  expect(await borderColorOf(history)).not.toBe(before);
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

async function createMergeE2eFixture(): Promise<MergeFixture> {
  const fixture = await createMergeFixture();
  fixtures.push(fixture);
  return fixture;
}

async function createConflictE2eFixture(): Promise<ConflictFixture> {
  const fixture = await createConflictFixture();
  fixtures.push(fixture);
  return fixture;
}

async function createSymbolE2eFixture(): Promise<SymbolFixture> {
  const fixture = await createSymbolFixture();
  fixtures.push(fixture);
  return fixture;
}

async function createInvalidRepositoryFixture(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "prettifer-not-repository-"));
  fixtures.push({ dispose: () => rm(path, { force: true, recursive: true }) });
  return path;
}

/** Resolved border colour of a region, which carries the current-region marker. */
async function borderColorOf(region: Locator): Promise<string> {
  return region.evaluate((element) => getComputedStyle(element).borderTopColor);
}

async function createSettingsDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "prettifer-settings-"));
  fixtures.push({ dispose: () => rm(path, { force: true, recursive: true }) });
  return path;
}

/** Opens the auth fixture and builds the two-commit result the rules group. */
async function composeAuthResult(page: Page, repositoryPath: string): Promise<void> {
  await openRepository(page, repositoryPath);
  await page.getByRole("button", { name: "Load Commit Range" }).click();
  await page.getByRole("checkbox", {
    name: "Include in selected result: docs(auth): explain session lifecycle",
  }).check();
  await page.getByRole("checkbox", {
    name: "Include in selected result: feat(auth): validate login request",
  }).check();
  await page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
}

/** Closes one application early, so the shared teardown does not close it twice. */
async function closeApplication(application: ElectronApplication): Promise<void> {
  const index = applications.indexOf(application);
  if (index >= 0) {
    applications.splice(index, 1);
  }
  await application.close();
}

async function launch(
  repositoryPaths: readonly string[],
  environment: Readonly<Record<string, string>> = {},
  settingsPath?: string,
): Promise<RunningApplication> {
  const application = await electron.launch({
    executablePath,
    args: settingsPath === undefined
      ? [applicationPath]
      : [applicationPath, `--user-data-dir=${settingsPath}`],
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
    await page.getByRole("button", { name: "Reload Workspace" }).click();
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

/** The path the review pane names; the changed-file list carries the same title. */
function reviewedPath(page: Page, path: string) {
  return page.locator("#diff-review").getByTitle(path, { exact: true });
}

async function openRepository(
  page: Page,
  repositoryPath: string,
  currentBranch = "feature/auth-session",
): Promise<void> {
  await page.getByRole("button", { name: "Open Repository" }).click();
  await expect(page.getByText(repositoryPath, { exact: true })).toBeVisible();
  await expect(page.getByText(`Current branch: ${currentBranch}`)).toBeVisible();
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
