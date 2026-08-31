import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function isFile(target) {
  try {
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  let target;
  if (specifier.startsWith("@/")) {
    target = path.join(projectRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : projectRoot;
    target = path.resolve(path.dirname(parent), specifier);
  } else {
    return nextResolve(specifier, context);
  }

  const candidates = [
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    path.join(target, "index.ts"),
    path.join(target, "index.js"),
    target,
  ];
  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
