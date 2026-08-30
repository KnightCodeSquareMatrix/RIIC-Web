import assert from "node:assert/strict";
import path from "node:path";
import process, { stderr, stdout } from "node:process";
import { fileURLToPath, URL } from "node:url";

const ACCEPTED_ENCODINGS = new Set(["br", "gzip"]);
const MINIMUM_SCRIPT_BYTES = 1_024;

function responseEncoding(response) {
  return response.headers.get("content-encoding")?.trim().toLowerCase() ?? "";
}

function assertCompressed(response, label) {
  const encoding = responseEncoding(response);
  assert.ok(
    ACCEPTED_ENCODINGS.has(encoding),
    `${label} must use gzip or Brotli for a real GET response; received ${encoding || "no Content-Encoding"}`,
  );
  return encoding;
}

export async function verifyPublicCompression(healthUrl, fetchImpl = globalThis.fetch) {
  const health = new URL(healthUrl);
  assert.ok(health.protocol === "https:" || health.protocol === "http:", "public health URL must use HTTP or HTTPS");

  const rootUrl = new URL("/", health);
  const requestOptions = {
    cache: "no-store",
    headers: { "accept-encoding": "br, gzip" },
    redirect: "follow",
  };
  const pageResponse = await fetchImpl(rootUrl, requestOptions);
  assert.ok(pageResponse.ok, `public page request failed with HTTP ${pageResponse.status}`);
  const pageEncoding = assertCompressed(pageResponse, "public HTML");
  const document = await pageResponse.text();
  const scriptPaths = [...document.matchAll(/<script[^>]+src="([^"]+\.js(?:\?[^"]*)?)"/g)]
    .map((match) => match[1]);
  assert.ok(scriptPaths.length > 0, "public HTML does not reference any JavaScript chunks");

  const scriptUrl = new URL(scriptPaths[0], rootUrl);
  assert.equal(scriptUrl.origin, rootUrl.origin, "public HTML must load its initial JavaScript from the same origin");
  const scriptResponse = await fetchImpl(scriptUrl, requestOptions);
  assert.ok(scriptResponse.ok, `public JavaScript request failed with HTTP ${scriptResponse.status}`);
  const scriptEncoding = assertCompressed(scriptResponse, "public JavaScript");
  const scriptBody = await scriptResponse.arrayBuffer();
  assert.ok(
    scriptBody.byteLength >= MINIMUM_SCRIPT_BYTES,
    `public JavaScript verification chunk is unexpectedly small: ${scriptBody.byteLength} bytes`,
  );

  return {
    pageEncoding,
    pageUrl: pageResponse.url || rootUrl.href,
    scriptBytes: scriptBody.byteLength,
    scriptEncoding,
    scriptUrl: scriptResponse.url || scriptUrl.href,
  };
}

const modulePath = path.normalize(fileURLToPath(import.meta.url)).toLowerCase();
const entryPath = process.argv[1] ? path.normalize(path.resolve(process.argv[1])).toLowerCase() : "";

if (entryPath === modulePath) {
  const healthUrl = process.argv[2] ?? process.env.DEPLOY_PUBLIC_HEALTH_URL;
  if (!healthUrl) {
    stderr.write("usage: node scripts/verify-public-compression.mjs <public-health-url>\n");
    process.exitCode = 1;
  } else {
    try {
      const result = await verifyPublicCompression(healthUrl);
      stdout.write(
        `public compression passed: HTML ${result.pageEncoding}; JavaScript ${result.scriptEncoding}, ${result.scriptBytes} decoded bytes\n`,
      );
    } catch (error) {
      stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
