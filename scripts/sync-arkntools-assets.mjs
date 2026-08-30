#!/usr/bin/env node
/* global console */

import path from "node:path";
import process from "node:process";

import { checkGeneratedAssets, generateAssets } from "./arkntools-assets-lib.mjs";

function parseArguments(argv) {
  const options = { check: false, allowRemovals: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--allow-removals") options.allowRemovals = true;
    else if (argument === "--source") options.sourceRoot = argv[++index];
    else if (argument === "--source-sha") options.sourceSha = argv[++index];
    else if (argument === "--portraits-source") options.portraitsRoot = argv[++index];
    else if (argument === "--portraits-source-sha") options.portraitsSha = argv[++index];
    else throw new Error(`未知参数：${argument}`);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
const outputRoot = process.cwd();

if (options.check) {
  const manifest = await checkGeneratedAssets(outputRoot);
  console.log(`arkntools 资源校验通过：${manifest.counts.operators} 名干员、${manifest.counts.buildingSkills} 个基建技能、${manifest.counts.productIcons} 张产物图标、来源 ${manifest.source.commit.slice(0, 12)}。`);
} else {
  if (!options.sourceRoot || !options.sourceSha || !options.portraitsRoot || !options.portraitsSha) {
    throw new Error("同步时必须同时提供 --source、--source-sha、--portraits-source 和 --portraits-source-sha。");
  }
  const result = await generateAssets({
    sourceRoot: path.resolve(options.sourceRoot),
    sourceSha: options.sourceSha,
    portraitsRoot: path.resolve(options.portraitsRoot),
    portraitsSha: options.portraitsSha,
    outputRoot,
    allowRemovals: options.allowRemovals,
  });
  console.log(JSON.stringify({ ...result.manifest, removedManagedFiles: result.removals.length }, null, 2));
}
