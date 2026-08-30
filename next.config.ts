import type { NextConfig } from "next";

import buildTracingPolicy from "./build-tracing-policy.json";
import { isSklandFeatureEnabled } from "./src/deployment";

const outputFileTracingExcludes = [
  ...buildTracingPolicy.excludedDirectories.map((directory) => `./${directory}/**/*`),
  ...buildTracingPolicy.excludedFiles.map((file) => `./${file}`),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  compress: true,
  async headers() {
    return [
      {
        source: "/images/operator-portraits/:asset",
        has: [{ type: "query", key: "v", value: "\\d+-[0-9a-f]{12}" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/products/:asset",
        has: [{ type: "query", key: "v", value: "\\d+-[0-9a-f]{12}" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      // 以下目录按一年强缓存处理。profession / building-room-emblems / ui 是静态资源，
      // 不随 sync-arkntools-assets 工作流更新；若手工更新这些图片，必须改文件名或加版本参数，
      // 否则浏览器最长一年内会继续使用旧图。
      // building-skills 实际随工作流更新，当前暂不加版本号，更新源后同样存在最长一年的旧图窗口。
      {
        source: "/images/building-skills/:asset",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/profession/:asset",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/building-room-emblems/:asset",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/images/ui/:asset",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  env: {
    APP_CLIENT_ACCOUNT_CLOUD_SYNC_ENABLED: process.env.ACCOUNT_CLOUD_SYNC_ENABLED === "1" ? "1" : "0",
    APP_CLIENT_SKLAND_ENABLED: isSklandFeatureEnabled() ? "1" : "0",
    APP_CLIENT_SKLAND_API_PREFIX: isSklandFeatureEnabled() ? "/api/skland" : "",
  },
  turbopack: {
    resolveAlias: {
      "account-cloud-workspace-bridge": process.env.ACCOUNT_CLOUD_SYNC_ENABLED === "1"
        ? "./src/components/cloud/useAccountCloudWorkspace.tsx"
        : "./src/components/cloud/useAccountCloudWorkspace.disabled.ts",
      "workbench-skland-route": isSklandFeatureEnabled()
        ? "./src/components/workbench/SklandRoute.tsx"
        : "./src/components/workbench/SklandRoute.disabled.tsx",
    },
  },
  outputFileTracingExcludes: {
    "/*": outputFileTracingExcludes,
  },
  experimental: {
    cpus: 4,
  },
  typedRoutes: false,
};

export default nextConfig;
