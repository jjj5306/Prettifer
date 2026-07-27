import { createRequire } from "node:module";

import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { describe, expect, it } from "vitest";

interface ForgePlugin {
  readonly name?: string;
  readonly fusesConfig?: Readonly<Record<string | number, boolean | string>>;
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
});
