import assert from "node:assert/strict";
import { log } from "node:console";
import { cp, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const nextRoot = path.join(repoRoot, ".next");
const standaloneRoot = path.join(nextRoot, "standalone");

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

await cp(path.join(repoRoot, "public"), path.join(standaloneRoot, "public"), {
  recursive: true,
  force: true,
});
await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await cp(path.join(nextRoot, "static"), path.join(standaloneRoot, ".next", "static"), {
  recursive: true,
  force: true,
});

log("Prepared standalone Next.js runtime with public and .next/static assets.");
