// Reproducible preparation of the credited Salamander acoustic sample subset.
// Usage: node scripts/prepare-drum-samples.mjs INDEX_JSON CACHE_DIRECTORY
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const [indexPath,cache]=process.argv.slice(2);
const index=JSON.parse(readFileSync(indexPath,'utf8'));
const pieces={kick:['kick_OH_P','kick_OH_FF',2],snare:['snare_OH_Ghost','snare_OH_FF',2],hihat:['hihatClosed_OH_P','hihatClosed_OH_F',.7],openhat:['hihatOpen_OH_P','hihatOpen_OH_FF',2],tomhigh:['hiTom_OH_P','hiTom_OH_FF',2.5],tomlow:['loTom_OH_PP','loTom_OH_FF',3],crash:['crash2_OH_P','crash2_OH_FF',5],ride:['ride2_OH_PP','ride2_OH_FF',4]};
mkdirSync(cache,{recursive:true});mkdirSync('public/audio/salamander',{recursive:true});
for(const [piece,[soft,hard,duration]] of Object.entries(pieces))for(const [layer,prefix] of [soft,hard].entries())for(let take=1;take<=2;take++){
  // The mirror's first soft kick is a silent/corrupt recording. Use two verified takes.
  const sourceTake=piece==='kick'&&layer===0?take+1:take;
  const entry=index.find(e=>e.name===`${prefix}_${sourceTake}.flac`);
  if(!entry)throw Error(`Missing source: ${prefix}_${take}`);
  const source=join(cache,entry.name);
  if(!existsSync(source))execFileSync('curl',['-fsSL','--retry','2','--max-time','90',entry.download_url,'-o',source]);
  const destination=`public/audio/salamander/${piece}-${layer}-${take}.wav`;
  execFileSync('ffmpeg',['-v','error','-y','-i',source,'-af',`silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.001,atrim=duration=${duration},areverse,afade=t=in:d=0.04,areverse,afade=t=in:d=0.0005,aresample=44100,alimiter=limit=0.9:level=0:latency=1`,'-ar','44100','-c:a','pcm_s16le',destination]);
  console.log(`${entry.name} -> ${destination}`);
}
