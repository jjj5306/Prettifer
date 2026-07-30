import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { describe, expect, it } from "vitest";

interface ForgePlugin {
  readonly name?: string;
  readonly fusesConfig?: Readonly<Record<string | number, boolean | string>>;
  getHooks?: () => {
    packageAfterCopy?: (
      forgeConfig: unknown,
      buildPath: string,
    ) => Promise<void>;
  };
}

const require = createRequire(import.meta.url);

describe("Electron Forge security configuration", () => {
  it("locks the packaged app to the signed application boundary", () => {
    const config = require("../../../forge.config.cjs") as {
      readonly packagerConfig?: { readonly asar?: boolean };
      readonly plugins?: readonly ForgePlugin[];
    };
    const fuses = config.plugins?.find((plugin) => plugin.name === "fuses")?.fusesConfig;

    expect(config.packagerConfig?.asar).toBe(true);
    expect(fuses).toMatchObject({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  });

  it("keeps the end-to-end main bundle out of the packaged application", async () => {
    const config = require("../../../forge.config.cjs") as {
      readonly plugins?: readonly ForgePlugin[];
    };
    const hook = config.plugins
      ?.find((plugin) => plugin.name === "packaged-main-entry")
      ?.getHooks?.().packageAfterCopy;
    if (hook === undefined) {
      throw new Error("The packaged main entry hook is missing.");
    }
    const buildPath = await mkdtemp(join(tmpdir(), "prettifer-package-"));
    const mainPath = join(buildPath, ".webpack", "main");
    await mkdir(mainPath, { recursive: true });
    await writeFile(join(buildPath, "package.json"), JSON.stringify({ main: "unset" }), "utf8");
    for (const name of ["index.js", "index.js.map", "index-e2e.js", "index-e2e.js.map"]) {
      await writeFile(join(mainPath, name), "", "utf8");
    }

    await hook({}, buildPath);

    // The production bundle ships; the end-to-end entry and its map do not.
    expect((await readdir(mainPath)).sort()).toEqual(["index.js", "index.js.map"]);
  });
});