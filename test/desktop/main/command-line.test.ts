import { describe, expect, it } from "vitest";

import { repositoryPathFromArgv } from "../../../src/desktop/main/command-line.js";

const packagedExe = "C:\\Program Files\\Prettifer\\prettifer.exe";
const electronExe = "C:\\node_modules\\electron\\electron.exe";
const devScript = ".webpack\\main\\index.js";
const repository = "C:\\work\\repo";

describe("repositoryPathFromArgv", () => {
  it("reads the first path a packaged app was given", () => {
    expect(repositoryPathFromArgv([packagedExe, repository], true)).toBe(repository);
  });

  it("skips the script path when running from source", () => {
    expect(repositoryPathFromArgv([electronExe, devScript, repository], false))
      .toBe(repository);
  });

  it("ignores the switches Electron appends", () => {
    expect(repositoryPathFromArgv(
      [packagedExe, "--remote-debugging-port=9222", repository, "--disable-gpu"],
      true,
    )).toBe(repository);
  });

  it("reports no path when only switches were given", () => {
    expect(repositoryPathFromArgv([packagedExe, "--remote-debugging-port=9222"], true))
      .toBeNull();
  });

  it("reports no path when the app was started without arguments", () => {
    expect(repositoryPathFromArgv([packagedExe], true)).toBeNull();
    expect(repositoryPathFromArgv([electronExe, devScript], false)).toBeNull();
  });

  it("treats a blank argument as no path", () => {
    expect(repositoryPathFromArgv([packagedExe, "   "], true)).toBeNull();
  });

  it("takes only the first path when several are given", () => {
    expect(repositoryPathFromArgv([packagedExe, repository, "C:\\work\\other"], true))
      .toBe(repository);
  });
});
