import {
  chromium,
  expect,
  test,
  type Browser,
  type Page,
} from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

import {
  createAuthHistoryFixture,
  type GitFixture,
} from "../support/git-fixture.js";

const executablePath = process.env.PRETTIFER_PACKAGE_EXE ?? resolve(
  "out",
  "desktop",
  "prettifer-win32-x64",
  "prettifer.exe",
);

let browser: Browser | undefined;
let fixture: GitFixture | undefined;
let packagedProcess: ChildProcess | undefined;

test.afterEach(async () => {
  await browser?.close().catch(() => undefined);
  if (packagedProcess?.exitCode === null) {
    packagedProcess.kill();
  }
  await fixture?.dispose();
  browser = undefined;
  fixture = undefined;
  packagedProcess = undefined;
});

test("runs the packaged Windows app through its main flow and exits normally", async () => {
  test.skip(process.platform !== "win32", "Windows 패키지 smoke 테스트입니다.");
  fixture = await createAuthHistoryFixture();
  const port = await availablePort();
  packagedProcess = spawn(executablePath, [`--remote-debugging-port=${port}`], {
    env: {
      ...process.env,
      PRETTIFER_E2E: "1",
      PRETTIFER_E2E_REPOSITORIES: JSON.stringify([fixture.path]),
    },
    stdio: "ignore",
    windowsHide: true,
  });

  browser = await connectToPackagedApp(port);
  const page = await rendererPage(browser);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => { pageErrors.push(error.message); });
  await page.reload({ waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Open Repository" }).click();
  await expect(
    page.getByRole("region", { name: "Repository and comparison range" })
      .getByText(fixture.path),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load Commit Range" }).click();
  await page.getByRole("checkbox", {
    name: "Include in selected result: feat(auth): validate login request",
  }).check();
  await page.getByRole("button", { name: "Build Selected Result" }).click();
  await expect(page.getByText(/Result ready · \d+ changed files/u)).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("packaged-composite-diff.png"),
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  await page.close();
  await expectProcessExit(packagedProcess);
});

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClose();
      } else {
        reject(error);
      }
    });
  });
  if (address === null || typeof address === "string") {
    throw new Error("패키지 smoke 테스트용 포트를 준비할 수 없습니다.");
  }
  return address.port;
}

async function connectToPackagedApp(port: number): Promise<Browser> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
        timeout: 1_000,
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => { setTimeout(resolveWait, 250); });
    }
  }
  throw new Error("패키지 앱의 렌더러에 연결할 수 없습니다.", { cause: lastError });
}

async function rendererPage(connectedBrowser: Browser): Promise<Page> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const page = connectedBrowser.contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().includes("main_window/index.html"));
    if (page !== undefined) {
      await page.waitForLoadState("domcontentloaded");
      return page;
    }
    await new Promise((resolveWait) => { setTimeout(resolveWait, 250); });
  }
  throw new Error("패키지 앱의 첫 화면을 찾을 수 없습니다.");
}

async function expectProcessExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  const result = await Promise.race([
    new Promise<"exit">((resolveExit) => { child.once("exit", () => { resolveExit("exit"); }); }),
    new Promise<"timeout">((resolveTimeout) => {
      setTimeout(() => { resolveTimeout("timeout"); }, 5_000);
    }),
  ]);
  expect(result).toBe("exit");
}
