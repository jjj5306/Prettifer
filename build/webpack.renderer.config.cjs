const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");
const { resolve } = require("node:path");

const {
  CommonJsPackageBoundaryPlugin,
} = require("./webpack.commonjs-package-boundary.cjs");

module.exports = {
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            // Absolute so the loader does not depend on the working directory.
            configFile: resolve(__dirname, "..", "tsconfig", "desktop.renderer.json"),
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              modules: {
                auto: /\.module\.css$/,
                localIdentName: "[name]__[local]__[hash:base64:5]",
                namedExport: false,
              },
            },
          },
        ],
      },
      {
        test: /\.(ttf|woff2?)$/,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new CommonJsPackageBoundaryPlugin(),
    new MonacoWebpackPlugin({
      languages: [
        "css",
        "html",
        "javascript",
        "json",
        "markdown",
        "plaintext",
        "typescript",
      ],
    }),
  ],
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
};
