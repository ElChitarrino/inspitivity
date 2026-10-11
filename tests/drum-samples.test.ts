import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DRUM_KITS,DRUM_SAMPLE_KEYS,VIRTUOSITY_KEYS,loadDrumSamples,loadMetalDrumSamples,drumSample,metalDrumSample,drumKitProfile,type AcousticDrumKit} from '../packages/sequencing/drum-samples.js';
import {SELECTABLE_MODES,canonicalMode} from '../packages/music-theory/index.js';
import {validProjects} from '../packages/workspace/index.js';

test('mode selectors use canonical aliases without invalidating existing projects',()=>{
  assert.ok(!(SELECTABLE_MODES as readonly string[]).includes('major')&&!(SELECTABLE_MODES as readonly string[]).includes('minor'));
  assert.ok(SELECTABLE_MODES.includes('ionian')&&SELECTABLE_MODES.includes('aeolian'));
  assert.equal(canonicalMode('major'),'ionian');assert.equal(canonicalMode('minor'),'aeolian');
  assert.equal(canonicalMode('harmonic minor'),'harmonic minor');
});
test('all acoustic samples are packaged as nonempty 44.1 kHz stereo PCM with bounded peaks',()=>{
  assert.equal(new Set(DRUM_SAMPLE_KEYS).size,32);
  for(const key of DRUM_SAMPLE_KEYS){
    const wav=readFileSync(`public/audio/salamander/${key}.wav`);
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
    let peak=0,frames=0;
    for(let at=12;at+8<=wav.length;){
      const type=wav.toString('ascii',at,at+4),size=wav.readUInt32LE(at+4),body=at+8;
      if(type==='fmt '){assert.equal(wav.readUInt16LE(body),1);assert.equal(wav.readUInt16LE(body+2),2);assert.equal(wav.readUInt32LE(body+4),44100);assert.equal(wav.readUInt16LE(body+14),16);}
      if(type==='data'){frames=size/4;for(let i=body;i<body+size;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i))/32768);}
      at=body+size+(size%2);
    }
    assert.ok(frames>4410&&peak>.01&&peak<=.901,`${key}: frames ${frames}, peak ${peak}`);
  }
});
test('all kit choices survive account project validation',()=>{
  for(const voice of DRUM_KITS)assert.ok(validProjects([{id:'p',name:'Test',key:'C ionian',meter:'4/4',bpm:120,updated:1,sections:[{id:'s',name:'Verse',color:'mint',bars:4,ideas:[{id:'d',type:'drums',name:'Kit',detail:'',voice,data:['kick|0|1|16']}]}]}]),voice);
});
test('every acoustic drum kit has a distinct audible playback profile',()=>{
  const acoustic=DRUM_KITS.filter((kit):kit is AcousticDrumKit=>kit!=='current');
  for(const instrument of ['kick','snare','hihat'] as const){
    const signatures=acoustic.map(kit=>JSON.stringify(drumKitProfile(kit,instrument,2)));
    assert.equal(new Set(signatures).size,acoustic.length,`${instrument} kit profiles must all differ`);
  }
  assert.equal(drumKitProfile('roomy rock','snare',2).route,'room');
  assert.equal(drumKitProfile('dark acoustic','hihat',2).filter,'lowpass');
  assert.ok(drumKitProfile('dry studio','snare',2).tailSeconds<drumKitProfile('acoustic studio','snare',2).tailSeconds);
  assert.ok(drumKitProfile('prog metal','kick',2).click>0);
  assert.ok(drumKitProfile('prog metal','kick',2).body>0);
  assert.ok(drumKitProfile('rock','snare',2).drive>0);
  assert.equal(drumKitProfile('dark acoustic','kick',2).drive,0);
});
test('acoustic samples load once per audio context and alternate strength and take',async()=>{
  const originalFetch=globalThis.fetch;
  let fetches=0,decodes=0;
  const context={decodeAudioData:async()=>({id:++decodes})} as unknown as AudioContext;
  globalThis.fetch=(async(url)=>{fetches++;const bytes=readFileSync(`public${url}`);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)} as Response;}) as typeof fetch;
  try{
    await Promise.all([loadDrumSamples(context),loadDrumSamples(context)]);
    await loadDrumSamples(context);
    assert.equal(fetches,2);assert.equal(decodes,32);
    const soft=drumSample(context,'kick',.3,0),alternate=drumSample(context,'kick',.3,1),hard=drumSample(context,'kick',.8,0);
    assert.ok(soft&&alternate&&hard);assert.notEqual(soft,alternate);assert.notEqual(soft,hard);
    assert.equal(drumSample(context,'kick',.3,2),soft);
  }finally{globalThis.fetch=originalFetch;}
});
test('rock and metal load an independent recorded kit with velocity layers',async()=>{
  assert.equal(VIRTUOSITY_KEYS.length,28);
  for(const key of VIRTUOSITY_KEYS)assert.ok(readFileSync(`public/audio/virtuosity/${key}.mp3`).length>5000,key);
  const originalFetch=globalThis.fetch;
  let decodes=0;
  const context={decodeAudioData:async()=>({id:++decodes})} as unknown as AudioContext;
  globalThis.fetch=(async(url)=>{const bytes=readFileSync(`public${url}`);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)} as Response;}) as typeof fetch;
  try{
    await Promise.all([loadDrumSamples(context),loadMetalDrumSamples(context),loadMetalDrumSamples(context)]);
    assert.equal(decodes,60);
    assert.notEqual(drumSample(context,'kick',.9,0),metalDrumSample(context,'kick',.9,0));
    assert.notEqual(metalDrumSample(context,'kick',.3,0),metalDrumSample(context,'kick',.9,0));
    assert.notEqual(metalDrumSample(context,'kick',.9,0),metalDrumSample(context,'kick',.9,1));
  }finally{globalThis.fetch=originalFetch;}
});
