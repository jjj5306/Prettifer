const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { PluginBase } = require("@electron-forge/plugin-base");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const { readFile, rm, writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");

/** Bundles the end-to-end entry produces, which must never ship. */
const E2E_MAIN_BUNDLES = ["index-e2e.js", "index-e2e.js.map"];

class PackagedMainEntryPlugin extends PluginBase {
  name = "packaged-main-entry";

  constructor() {
    super({});
  }

  getHooks() {
    return {
      packageAfterCopy: async (_forgeConfig, buildPath) => {
        const packagePath = resolve(buildPath, "package.json");
        const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
        packageJson.main = ".webpack/main/index.js";
        await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

        // The end-to-end entry exists only for Playwright. Drop it before asar so
        // no test seam reaches a shipped build.
        for (const bundle of E2E_MAIN_BUNDLES) {
          await rm(resolve(buildPath, ".webpack", "main", bundle), { force: true });
        }
      },
    };
  }
}

module.exports = {
  buildIdentifier: "desktop",
  packagerConfig: {
    asar: true,
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        mainConfig: "./build/webpack.main.config.cjs",
        renderer: {
          config: "./build/webpack.renderer.config.cjs",
          entryPoints: [
            {
              html: "./src/desktop/renderer/index.html",
              js: "./src/desktop/renderer/index.tsx",
              name: "main_window",
              preload: {
                js: "./src/desktop/preload/index.ts",
              },
            },
          ],
        },
      },
    },
    new PackagedMainEntryPlugin(),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
