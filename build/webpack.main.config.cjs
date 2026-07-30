const { resolve } = require("node:path");

const {
  CommonJsPackageBoundaryPlugin,
} = require("./webpack.commonjs-package-boundary.cjs");

module.exports = {
  devtool: "source-map",
  // Two main bundles from one build. The production entry ships; the end-to-end
  // entry is removed from the package by forge.config.cjs and only the Playwright
  // flow test launches it. Forge merges this config over its own defaults, so the
  // filename pattern replaces its fixed "index.js".
  entry: {
    index: "./src/desktop/main/index.ts",
    "index-e2e": "./src/desktop/main/index.e2e.ts",
  },
  output: {
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            // Absolute so the loader does not depend on the working directory.
            configFile: resolve(__dirname, "..", "tsconfig", "desktop.main.json"),
            transpileOnly: true,
          },
        },
      },
    ],
  },
  plugins: [new CommonJsPackageBoundaryPlugin()],
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
};
