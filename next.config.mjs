import path from "node:path";

const permissionlessRoot = path.resolve("./node_modules/permissionless");

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      permissionless$: path.join(permissionlessRoot, "_cjs/index.js"),
      "permissionless/accounts$": path.join(permissionlessRoot, "_cjs/accounts/index.js"),
      "permissionless/clients/pimlico$": path.join(permissionlessRoot, "_cjs/clients/pimlico.js"),
    };
    return config;
  },
};

export default nextConfig;
