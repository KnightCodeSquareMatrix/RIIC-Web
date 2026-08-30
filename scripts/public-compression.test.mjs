import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { verifyPublicCompression } from "./verify-public-compression.mjs";

const scriptBody = "globalThis.__compressionCheck = true;\n".repeat(64);
const documentBody = '<!doctype html><html><body><script src="/_next/static/chunks/app.js"></script></body></html>';

async function withServer({ compressScript }, run) {
  const server = createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, {
        "content-encoding": "gzip",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(gzipSync(documentBody));
      return;
    }
    if (request.url === "/_next/static/chunks/app.js") {
      response.writeHead(200, {
        ...(compressScript ? { "content-encoding": "gzip" } : {}),
        "content-type": "application/javascript; charset=utf-8",
      });
      response.end(compressScript ? gzipSync(scriptBody) : scriptBody);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}/api/health`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("public compression verification accepts compressed HTML and JavaScript GET responses", async () => {
  await withServer({ compressScript: true }, async (healthUrl) => {
    const result = await verifyPublicCompression(healthUrl);
    assert.equal(result.pageEncoding, "gzip");
    assert.equal(result.scriptEncoding, "gzip");
    assert.equal(result.scriptBytes, Buffer.byteLength(scriptBody));
  });
});

test("public compression verification rejects an uncompressed JavaScript GET response", async () => {
  await withServer({ compressScript: false }, async (healthUrl) => {
    await assert.rejects(
      verifyPublicCompression(healthUrl),
      /public JavaScript must use gzip or Brotli for a real GET response/,
    );
  });
});
