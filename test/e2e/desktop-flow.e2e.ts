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

test.afterEach(async () => {
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

  await openRepository(running.page, fixture.path);
  await running.page.getByRole("button", { name: "커밋 범위 불러오기" }).click();
  await running.page.getByRole("checkbox", {
    name: "통합에 포함: docs(auth): explain session lifecycle",
  }).check();
  await running.page.getByRole("checkbox", {
    name: "통합에 포함: feat(auth): validate login request",
  }).check();
  await expect(running.page.getByText("통합 선택 2개")).toBeVisible();

  await running.page.getByRole("button", { name: "통합 결과 만들기" }).click();
  await expect(running.page.getByText(/계산 완료 · 변경 파일/u)).toBeVisible();
  await running.page.getByRole("button", { name: /파일 보기: docs\/auth\.md/u }).click();
  await expect(running.page.getByRole("textbox", {
    name: "읽기 전용 diff: docs/auth.md · 원본과 통합 결과",
  })).toBeVisible();
  await expect(running.page.getByText("왼쪽 원본 · 오른쪽 통합 결과")).toBeVisible();
  await running.page.screenshot({
    path: test.info().outputPath("composite-diff.png"),
    fullPage: true,
  });

  const browserWindow = await running.application.browserWindow(running.page) as JSHandle<BrowserWindow>;
  await browserWindow.evaluate((window) => { window.webContents.setZoomFactor(2); });
  await expect.poll(() => browserWindow.evaluate((window) =>
    window.webContents.getZoomFactor(),
  )).toBe(2);
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
    path: test.info().outputPath("composite-diff-200-percent.png"),
    fullPage: true,
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
  await running.page.getByRole("button", { name: "커밋 범위 불러오기" }).click();
  await running.page.getByRole("checkbox", {
    name: "통합에 포함: feat(auth): validate login request",
  }).check();

  await running.page.getByRole("button", { name: "통합 결과 만들기" }).click();
  await running.page.getByRole("button", { name: "계산 취소" }).click();
  await expect(running.page.getByText(
    "계산을 취소했습니다. 선택한 커밋으로 다시 계산할 수 있습니다.",
  )).toBeVisible();
  await running.page.getByRole("button", { name: "통합 결과 다시 만들기" }).click();
  await expect(running.page.getByText(/계산 완료 · 변경 파일/u)).toBeVisible();
});

test("shows an actionable Git executable error", async () => {
  const fixture = await createFixture();
  const running = await launch([fixture.path], {
    PRETTIFER_E2E_GIT_PATH: "C:\\prettifer-e2e-missing\\git.exe",
  });

  await running.page.getByRole("button", { name: "저장소 폴더 선택" }).click();
  await expect(running.page.getByRole("alert")).toContainText(
    "Git 실행 파일을 사용할 수 없습니다.",
  );
  await expect(running.page.getByRole("alert")).toContainText(
    "Git을 설치하거나 실행 경로를 확인한 뒤 다시 시도해 주세요.",
  );
});

test("explains unsupported merge commits and recovers after an invalid repository", async () => {
  const fixture = await createHistoryE2eFixture();
  const invalidRepository = await createInvalidRepositoryFixture();
  const running = await launch([invalidRepository, fixture.path]);

  await running.page.getByRole("button", { name: "저장소 폴더 선택" }).click();
  await expect(running.page.getByRole("alert")).toContainText(
    "Git 저장소를 열 수 없습니다",
  );
  await running.page.getByRole("button", { name: "저장소 폴더 선택" }).click();
  await expect(running.page.getByText(fixture.path)).toBeVisible();
  await running.page.getByRole("button", { name: "커밋 범위 불러오기" }).click();

  await expect(running.page.getByText("병합 커밋 · 선택할 수 없음")).toBeVisible();
  await expect(running.page.getByRole("checkbox", {
    name: "통합에 포함할 수 없음: merge: include history side branch",
  })).toBeDisabled();
});

test("replaces repository state without showing the previous repository", async () => {
  const first = await createFixture();
  const second = await createFixture();
  const running = await launch([first.path, second.path], {
    PRETTIFER_E2E_COMPOSITION_DELAY_MS: "500",
  });

  await openRepository(running.page, first.path);
  await running.page.getByRole("button", { name: "커밋 범위 불러오기" }).click();
  await running.page.getByRole("checkbox", {
    name: "통합에 포함: feat(auth): validate login request",
  }).check();
  await running.page.getByRole("button", { name: "통합 결과 만들기" }).click();
  await running.page.getByRole("button", { name: "다른 저장소 선택" }).click();
  await expect(running.page.getByText(second.path)).toBeVisible();
  await expect(running.page.getByText(first.path)).not.toBeVisible();
  await expect(running.page.getByText("브랜치 범위를 먼저 불러와 주세요.")).toBeVisible();
  await running.page.waitForTimeout(600);
  await expect(running.page.getByText("브랜치 범위를 먼저 불러와 주세요.")).toBeVisible();
  await expect(running.page.getByText(/계산 완료 · 변경 파일/u)).not.toBeVisible();
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
  if (await page.getByRole("heading", { name: "앱 화면을 표시할 수 없습니다" }).isVisible()) {
    await page.getByRole("button", { name: "앱 화면 다시 열기" }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: test.info().outputPath("renderer-startup-error.png") });
    throw new Error([
      "렌더러가 시작 오류 화면으로 전환되었습니다.",
      `console: ${consoleErrors.join(" | ") || "없음"}`,
      `pageerror: ${pageErrors.join(" | ") || "없음"}`,
      `preload API: ${await page.evaluate(() => typeof window.prettifer)}`,
    ].join("\n"));
  }
  return { application, consoleErrors, page, pageErrors };
}

async function openRepository(page: Page, repositoryPath: string): Promise<void> {
  await page.getByRole("button", { name: "저장소 폴더 선택" }).click();
  await expect(page.getByText(repositoryPath)).toBeVisible();
  await expect(page.getByText("현재 브랜치: feature/auth-session")).toBeVisible();
}
