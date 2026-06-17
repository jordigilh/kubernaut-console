const path = require("path");
const { ConsoleRemotePlugin } = require("@openshift-console/dynamic-plugin-sdk-webpack");

module.exports = {
  entry: {},
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name]-bundle.js",
    chunkFilename: "[name]-chunk.js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.m?js/,
        resolve: { fullySpecified: false },
      },
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.resolve(__dirname, "tsconfig.json"),
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  plugins: [
    new ConsoleRemotePlugin({
      // Disable shared module version validation — pnpm hoists React 19
      // from sibling workspace packages, but plugin-ocm correctly resolves
      // React 18.3.1 at runtime. The OCP console provides React 18 as a
      // shared module via Module Federation.
      validateSharedModules: false,
    }),
  ],
  devServer: {
    port: 9001,
    static: path.join(__dirname, "dist"),
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
};
