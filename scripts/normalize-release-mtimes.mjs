import assert from "node:assert/strict";
import { readdir, utimes } from "node:fs/promises";
import path from "node:path";

const reproducibleTimestamp = new Date(0);

export async function normalizeReleaseMtimes(releaseRoot, publicTimestamp) {
  assert.ok(path.isAbsolute(releaseRoot), "release root must be absolute");
  assert.ok(Number.isFinite(publicTimestamp.getTime()), "public asset timestamp must be valid");
  const publicRoot = path.join(releaseRoot, ".next", "standalone", "public");

  async function visit(entryPath, insidePublicRoot) {
    const entries = await readdir(entryPath, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = path.join(entryPath, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `release tree must not contain symlinks: ${childPath}`);
      const childIsPublic = insidePublicRoot || childPath === publicRoot;
      if (entry.isDirectory()) {
        await visit(childPath, childIsPublic);
      } else {
        assert.equal(entry.isFile(), true, `release tree must contain only files: ${childPath}`);
        const timestamp = childIsPublic ? publicTimestamp : reproducibleTimestamp;
        await utimes(childPath, timestamp, timestamp);
      }
    }
    const timestamp = insidePublicRoot ? publicTimestamp : reproducibleTimestamp;
    await utimes(entryPath, timestamp, timestamp);
  }

  await visit(releaseRoot, false);
}
