const { resolve } = require("node:path");

const {
  CommonJsPackageBoundaryPlugin,
} = require("./webpack.commonjs-package-boundary.cjs");

module.exports = {
  devtool: "source-map",
  entry: "./src/desktop/main/index.ts",
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
