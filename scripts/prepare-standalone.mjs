import assert from "node:assert/strict";
import { log } from "node:console";
import { cp, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const nextRoot = path.join(repoRoot, ".next");
const standaloneRoot = path.join(nextRoot, "standalone");
const operationalRuntimeEntries = [
  "drizzle",
  "node_modules/drizzle-orm",
  "scripts/check-auth-readiness.mts",
  "scripts/migrate-db.mts",
  "src/server/auth/config.ts",
];

async function isFile(filePath) {
  try {
    return (await lstat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

assert.equal(
  await isFile(path.join(standaloneRoot, "server.js")),
  true,
  "Next.js standalone server is missing; build with output: 'standalone' first",
);

for (const binaryName of ["infra-cli", "infra-cli.exe"]) {
  assert.equal(
    await isFile(path.join(standaloneRoot, "bin", binaryName)),
    false,
    `standalone website output must not contain ${binaryName}`,
  );
}

for (const environmentName of [".env", ".env.production", ".env.local", ".env.production.local"]) {
  assert.equal(
    await isFile(path.join(standaloneRoot, environmentName)),
    false,
    `standalone website output must not contain ${environmentName}`,
  );
}

await cp(path.join(repoRoot, "public"), path.join(standaloneRoot, "public"), {
  recursive: true,
  force: true,
});
await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await cp(path.join(nextRoot, "static"), path.join(standaloneRoot, ".next", "static"), {
  recursive: true,
  force: true,
});

for (const relativePath of operationalRuntimeEntries) {
  const destination = path.join(standaloneRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(repoRoot, relativePath), destination, {
    recursive: true,
    force: true,
  });
}

log("Prepared standalone Next.js runtime with public and .next/static assets.");
