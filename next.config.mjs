import path from "node:path";

const permissionlessRoot = path.resolve("./node_modules/permissionless");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    webpackBuildWorker: false,
  },
  webpack(config, { isServer, webpack }) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      permissionless$: path.join(permissionlessRoot, "_cjs/index.js"),
      "permissionless/accounts$": path.join(permissionlessRoot, "_cjs/accounts/index.js"),
      "permissionless/clients/pimlico$": path.join(permissionlessRoot, "_cjs/clients/pimlico.js"),
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        module: false,
        path: false,
        url: false,
      };
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
