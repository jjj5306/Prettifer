const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { PluginBase } = require("@electron-forge/plugin-base");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const { readFile, writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");

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
        mainConfig: "./webpack.main.config.cjs",
        renderer: {
          config: "./webpack.renderer.config.cjs",
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
