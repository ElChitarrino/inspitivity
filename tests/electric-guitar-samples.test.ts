import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {ELECTRIC_GUITAR_ROOTS,electricGuitarRoot,electricGuitarSample,loadElectricGuitarSamples} from '../packages/sequencing/electric-guitar-samples.js';

test('recorded electric-guitar notes cover low riffs and return distinct takes',async()=>{
  assert.equal(electricGuitarRoot(38),36);
  assert.equal(electricGuitarRoot(46),45);
  assert.ok(ELECTRIC_GUITAR_ROOTS.includes(36));
  for(const root of ELECTRIC_GUITAR_ROOTS){
    const mp3=readFileSync(`public/audio/electric-guitar/${root}-hard-1.mp3`);
    assert.ok(mp3.length>5000,`${root} is missing an audible recorded note`);
  }
  const originalFetch=globalThis.fetch;
  let fetches=0;
  const context={decodeAudioData:async()=>({id:++fetches,duration:3})} as unknown as AudioContext;
  globalThis.fetch=(async(url)=>{const bytes=readFileSync(`public${url}`);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)} as Response;}) as typeof fetch;
  try{
    await Promise.all([loadElectricGuitarSamples(context),loadElectricGuitarSamples(context)]);
    assert.equal(fetches,24);
    const first=electricGuitarSample(context,36,false,0),second=electricGuitarSample(context,36,false,1);
    assert.ok(first&&second);
    assert.notEqual(first.buffer,second.buffer);
    assert.notEqual(electricGuitarSample(context,36,true,0)?.buffer,first.buffer);
  }finally{globalThis.fetch=originalFetch;}
});
