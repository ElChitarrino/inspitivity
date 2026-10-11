import { readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Source: FreePats Spanish Classical Guitar (CC0), 2019-06-18.
// Run: node scripts/prepare-guitar-samples.mjs /path/to/spanish-classical-guitar
const source=resolve(process.argv[2] ?? "");
const output=resolve("public/audio/classical-guitar");
const names=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const toMidi=name=>{const match=name.match(/^([A-G]#?)(\d+)\.flac$/);return match?names.indexOf(match[1])+12*(Number(match[2])+1):null;};
const available=(await readdir(join(source,"samples"))).map(name=>({name,pitch:toMidi(name)})).filter(item=>item.pitch!==null);
const roots=[...new Set(Array.from({length:23},(_,index)=>40+index*2).map(target=>available.reduce((best,item)=>Math.abs(item.pitch-target)<Math.abs(best.pitch-target)?item:best).pitch))].sort((a,b)=>a-b);
await mkdir(output,{recursive:true});
for(const pitch of roots){
  const sample=available.find(item=>item.pitch===pitch);
  const result=spawnSync("ffmpeg",["-nostdin","-loglevel","error","-y","-i",join(source,"samples",sample.name),"-ac","1","-ar","44100","-codec:a","libmp3lame","-q:a","1",join(output,`${pitch}.mp3`)],{stdio:"inherit"});
  if(result.status!==0)throw new Error(`Failed preparing guitar sample ${sample.name}`);
}
await copyFile(join(source,"LICENSE"),join(output,"LICENSE.txt"));
await writeFile(join(output,"CREDITS.md"),"FreePats Spanish classical guitar, recorded by roberto@zenvoid.org (2008), instrument version 2019-06-18. CC0 1.0. Source: https://github.com/freepats/spanish-classical-guitar . The MP3 files are converted from the source FLAC samples with FFmpeg.\n");
await writeFile(join(output,"manifest.json"),JSON.stringify({roots}));
console.log(`Prepared ${roots.length} CC0 guitar samples in ${output}`);
