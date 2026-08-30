import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const nextServerRoot = path.join(repoRoot, ".next", "server");
const policy = JSON.parse(await readFile(new URL("../build-tracing-policy.json", import.meta.url), "utf8"));
const forbiddenRoots = policy.excludedDirectories.map((directory) => path.join(repoRoot, directory));
const forbiddenFiles = new Set(policy.excludedFiles.map((file) => path.join(repoRoot, file)));

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function findTraceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTraceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".nft.json") ? [entryPath] : [];
  }));
  return nested.flat();
}

function resolveTraceEntry(tracePath, entry) {
  const normalizedEntry = entry.replaceAll("\\", "/");
  const withoutParents = normalizedEntry.replace(/^(?:\.\.\/)+/, "");
  if (/^[A-Za-z]:\//.test(withoutParents) || withoutParents.startsWith("/")) {
    return { absolutePath: withoutParents, outsideRepository: true };
  }

  const absolutePath = path.resolve(path.dirname(tracePath), entry);
  return { absolutePath, outsideRepository: !isInside(repoRoot, absolutePath) };
}

const traceFiles = await findTraceFiles(nextServerRoot);
assert.ok(traceFiles.length > 0, "no Next.js output trace manifests were found; run npm run build first");

const violations = [];
let tracedFileCount = 0;

for (const tracePath of traceFiles) {
  const manifest = JSON.parse(await readFile(tracePath, "utf8"));
  assert.ok(Array.isArray(manifest.files), `${path.relative(repoRoot, tracePath)} does not contain a files array`);
  tracedFileCount += manifest.files.length;

  for (const entry of manifest.files) {
    const { absolutePath, outsideRepository } = resolveTraceEntry(tracePath, entry);
    const forbidden = outsideRepository
      || forbiddenFiles.has(absolutePath)
      || forbiddenRoots.some((root) => isInside(root, absolutePath));
    if (forbidden) {
      violations.push({
        trace: path.relative(repoRoot, tracePath),
        entry,
      });
    }
  }
}

if (violations.length > 0) {
  const sample = violations
    .slice(0, 20)
    .map(({ trace, entry }) => `- ${trace}: ${entry}`)
    .join("\n");
  throw new Error(`production output tracing included ${violations.length} forbidden runtime or repository-external files:\n${sample}`);
}

stdout.write(`production output tracing passed: ${traceFiles.length} manifests, ${tracedFileCount} traced file entries\n`);
