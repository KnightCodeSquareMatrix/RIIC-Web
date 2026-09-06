import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, realpath, rename, statfs } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";
import console from "node:console";
import process from "node:process";

export const ARCHIVE_UNITS = ["arknights-infra.service", "arknights-infra-worker.service", "arknights-infra-dev.service", "arknights-infra-dev-worker.service"];

export async function prepareArchiveRoot(directory) {
  if (!path.isAbsolute(directory) || [path.parse(directory).root, homedir(), process.cwd(), "/var", "/var/lib"].includes(path.resolve(directory))) {
    throw new Error("Archive root must be a dedicated absolute private directory");
  }
  await mkdir(directory,{recursive:true,mode:0o700});
  if (await realpath(directory) !== path.resolve(directory)) throw new Error("Archive root cannot be a symlink");
}

/** Checkpoint advances ONLY after both the complete gzip and the producer succeed. No pruning. */
export async function archiveStream({directory,unit,until,source,completed=Promise.resolve()}) {
  if (!ARCHIVE_UNITS.includes(unit)) throw new Error("Unknown journal unit");
  const name=`${unit}-${until}-${randomUUID()}.jsonl.gz`;
  const partial=path.join(directory,`${name}.partial`);
  const final=path.join(directory,name);
  // Observe rejection immediately while the source is streaming.
  await Promise.all([pipeline(source,createGzip(),createWriteStream(partial,{flags:"wx",mode:0o600})),completed]);
  const file=await open(partial,"r+");
  try { await file.sync(); } finally { await file.close(); }
  await rename(partial,final);
  const checkpointTemp=path.join(directory,`${unit}-${randomUUID()}.checkpoint.tmp`);
  const checkpoint=await open(checkpointTemp,"wx",0o600);
  try { await checkpoint.writeFile(JSON.stringify({until,archive:name})); await checkpoint.sync(); }
  finally { await checkpoint.close(); }
  await rename(checkpointTemp,path.join(directory,`${unit}.checkpoint.json`));
  // Linux directory fsync makes completed segments and the checkpoint durable together.
  if (process.platform !== "win32") {
    const parent=await open(directory,"r");
    try { await parent.sync(); } finally { await parent.close(); }
  }
  return name;
}

export async function archiveJournals(directory) {
  await prepareArchiveRoot(directory);
  const disk=await statfs(directory);
  const available=disk.bavail*disk.bsize;
  if (available < 2*1024**3) console.error(JSON.stringify({event:"log_archive_low_disk",availableBytes:available}));
  const until=Math.floor(Date.now()/1000);
  for (const unit of ARCHIVE_UNITS) {
    let since=0;
    try {
      const checkpoint=JSON.parse(await readFile(path.join(directory,`${unit}.checkpoint.json`),"utf8"));
      if (!Number.isSafeInteger(checkpoint.until) || checkpoint.until<0 || checkpoint.until>until) throw new Error("Invalid archive checkpoint");
      // Overlap one second, preferring duplicates to a boundary gap.
      since=Math.max(0,checkpoint.until-1);
    } catch(error) { if (error.code!=="ENOENT") throw error; }
    const child=spawn("journalctl",["-u",unit,"--since",`@${since}`,"--until",`@${until}`,"-o","json","--no-pager"],{stdio:["ignore","pipe","inherit"]});
    const completed=new Promise((resolve,reject)=>{
      child.once("error",reject);
      child.once("close",code=>code===0 ? resolve() : reject(new Error(`journalctl failed (${code})`)));
    });
    const archive=await archiveStream({directory,unit,until,source:child.stdout,completed});
    console.log(JSON.stringify({event:"journal_archived",unit,since,until,archive}));
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  archiveJournals(process.argv[2] ?? "/var/lib/riic-log-archive").catch(error=>{
    console.error(error); process.exitCode=1;
  });
}
