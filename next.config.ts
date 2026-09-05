import type { NextConfig } from "next";

import buildTracingPolicy from "./build-tracing-policy.json";
import { isSklandFeatureEnabled } from "./src/deployment";

const outputFileTracingExcludes = [
  ...buildTracingPolicy.excludedDirectories.map((directory) => `./${directory}/**/*`),
  ...buildTracingPolicy.excludedFiles.map((file) => `./${file}`),
];

const uncachedDocumentRoutes = [
  "/",
  "/about",
  "/account",
  "/account/reset-password",
  "/admin/users",
  "/manual",
  "/mastery",
  "/privacy",
  "/skills",
  "/skland",
  "/terms",
  "/training",
];

const documentCacheControl = "private, no-cache, no-store, max-age=0, must-revalidate";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  compress: true,
  deploymentId: process.env.APP_BUILD_ID,
  generateBuildId: async () => process.env.APP_BUILD_ID ?? "local-development",
  output: "standalone",
  async headers() {
    return [
      ...uncachedDocumentRoutes.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: documentCacheControl }],
      })),
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
      // 以下目录按一年强缓存处理。profession / building-room-emblems / ui / elite 是静态资源，
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
      {
        source: "/images/elite/:asset",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  env: {
    APP_CLIENT_BUILD_ID: process.env.APP_BUILD_ID ?? "local-development",
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
    turbopackChunking: {
      minChunkSize: 75_000,
    },
  },
  typedRoutes: false,
};

export default nextConfig;
