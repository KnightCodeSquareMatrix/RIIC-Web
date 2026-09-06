import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import process from "node:process";
import { setTimeout } from "node:timers";
import { gunzipSync } from "node:zlib";
import { archiveStream, prepareArchiveRoot } from "./archive-journals.mjs";

test("journal archives retain original lines and previous segments without pruning",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"riic-journal-test-"));
  try {
    await prepareArchiveRoot(directory);
    const unit="arknights-infra.service";
    const first=await archiveStream({directory,unit,until:10,source:Readable.from(['{"MESSAGE":"old log"}\n'])});
    const second=await archiveStream({directory,unit,until:20,source:Readable.from(['{"MESSAGE":"new log"}\n'])});
    assert.equal(gunzipSync(await readFile(path.join(directory,first))).toString(),'{"MESSAGE":"old log"}\n');
    assert.equal(gunzipSync(await readFile(path.join(directory,second))).toString(),'{"MESSAGE":"new log"}\n');
    assert.equal(JSON.parse(await readFile(path.join(directory,`${unit}.checkpoint.json`))).until,20);
    await assert.rejects(archiveStream({directory,unit,until:30,source:Readable.from(["incomplete"]),completed:Promise.reject(new Error("producer failed"))}),/producer failed/);
    assert.equal(JSON.parse(await readFile(path.join(directory,`${unit}.checkpoint.json`))).until,20);
    assert.ok((await readdir(directory)).includes(first));
    // Let the failed producer's output stream finish; its partial segment is retained.
    await new Promise(resolve=>setTimeout(resolve,50));
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test("archive rejects broad roots and unknown units",async()=>{
  await assert.rejects(prepareArchiveRoot(path.parse(process.cwd()).root));
  await assert.rejects(archiveStream({directory:tmpdir(),unit:"../../other",until:10,source:Readable.from([])}));
});
