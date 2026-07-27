const { Compilation, sources } = require("webpack");

class CommonJsPackageBoundaryPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap(
      "CommonJsPackageBoundaryPlugin",
      (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: "CommonJsPackageBoundaryPlugin",
            stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
          },
          () => {
            compilation.emitAsset(
              "package.json",
              new sources.RawSource('{"type":"commonjs"}\n'),
            );
          },
        );
      },
    );
  }
}

module.exports = { CommonJsPackageBoundaryPlugin };
