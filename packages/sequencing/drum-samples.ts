import {DRUM_INSTRUMENTS,type DrumInstrument} from './index.js';
export const DRUM_KITS = ['acoustic studio','dry studio','rock','prog metal','roomy rock','dark acoustic','current'] as const;
export type DrumKit = typeof DRUM_KITS[number];
export const DRUM_KIT_LABELS:Record<DrumKit,string>={
  'acoustic studio':'Acoustic studio · samples','dry studio':'Dry studio · samples',rock:'Rock · samples','prog metal':'Progressive metal · samples','roomy rock':'Roomy rock · samples','dark acoustic':'Dark acoustic · samples',current:'Electronic · original synth',
};
export type AcousticDrumKit=Exclude<DrumKit,'current'>;
export type DrumKitProfile={
  route:'dry'|'room';
  filter:BiquadFilterType;
  frequency:number;
  q:number;
  gain:number;
  playbackRate:number;
  tailSeconds:number;
  drive:number;
  level:number;
  click:number;
  body:number;
};

/** Deliberately distinct playback profiles for the shared acoustic sample bank. */
export function drumKitProfile(kit:AcousticDrumKit,instrument:DrumInstrument,bufferDuration:number):DrumKitProfile{
  const cymbal=['hihat','openhat','crash','ride'].includes(instrument);
  switch(kit){
    case 'dry studio': return {route:'dry',filter:'peaking',frequency:cymbal?5200:900,q:1.1,gain:-2,playbackRate:1.015,tailSeconds:Math.min(bufferDuration,cymbal?.32:.4),drive:0,level:.95,click:0,body:0};
    case 'rock': return {route:'room',filter:'lowshelf',frequency:180,q:.7,gain:4,playbackRate:.965,tailSeconds:Math.min(bufferDuration,cymbal?1.8:.9),drive:1.5,level:.9,click:0,body:instrument==='kick'?.2:0};
    case 'prog metal': return {route:'dry',filter:'peaking',frequency:instrument==='kick'?3200:instrument==='snare'?2100:4600,q:1.3,gain:5,playbackRate:1.045,tailSeconds:Math.min(bufferDuration,cymbal?1.1:instrument==='snare'?.5:.34),drive:2.4,level:.79,click:instrument==='kick'?.22:instrument==='snare'?.07:0,body:instrument==='kick'?.26:0};
    case 'roomy rock': return {route:'room',filter:'peaking',frequency:cymbal?4200:240,q:.65,gain:2.5,playbackRate:.935,tailSeconds:bufferDuration,drive:1.15,level:.88,click:0,body:instrument==='kick'?.13:0};
    case 'dark acoustic': return {route:'dry',filter:'lowpass',frequency:cymbal?3000:2200,q:.85,gain:0,playbackRate:.94,tailSeconds:Math.min(bufferDuration,cymbal?1.25:.78),drive:0,level:1.05,click:0,body:0};
    default: return {route:'dry',filter:'peaking',frequency:cymbal?6200:320,q:.7,gain:0,playbackRate:1,tailSeconds:bufferDuration,drive:0,level:1,click:0,body:0};
  }
}
export const DRUM_SAMPLE_KEYS=DRUM_INSTRUMENTS.flatMap(piece=>[0,1].flatMap(layer=>[1,2].map(take=>`${piece}-${layer}-${take}`)));
export const VIRTUOSITY_KEYS=DRUM_INSTRUMENTS.filter(piece=>piece!=='crash').flatMap(piece=>[0,1].flatMap(layer=>[1,2].map(take=>`${piece}-${layer}-${take}`)));
const banks=new WeakMap<BaseAudioContext,Map<string,AudioBuffer>>();
const pending=new WeakMap<BaseAudioContext,Promise<void>>();
const metalBanks=new WeakMap<BaseAudioContext,Map<string,AudioBuffer>>();
const metalPending=new WeakMap<BaseAudioContext,Promise<void>>();
export function loadDrumSamples(context:AudioContext):Promise<void>{
  if(banks.has(context))return Promise.resolve();
  const existing=pending.get(context);if(existing)return existing;
  const task=(async()=>{
    const bank=new Map<string,AudioBuffer>();let index=0;
    await Promise.all(Array.from({length:4},async()=>{
      while(index<DRUM_SAMPLE_KEYS.length){
        const key=DRUM_SAMPLE_KEYS[index++];
        const response=await fetch(`/audio/salamander/${key}.wav`,{signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Error('Acoustic drum samples could not load. Check your connection and try Play again.');
        bank.set(key,await context.decodeAudioData(await response.arrayBuffer()));
      }
    }));
    banks.set(context,bank);
  })().finally(()=>pending.delete(context));
  pending.set(context,task);return task;
}
export function drumSample(context:AudioContext,instrument:DrumInstrument,velocity:number,take:number){
  return banks.get(context)?.get(`${instrument}-${velocity<.5?0:1}-${take%2+1}`);
}
export function loadMetalDrumSamples(context:AudioContext):Promise<void>{
  if(metalBanks.has(context))return Promise.resolve();
  const existing=metalPending.get(context);if(existing)return existing;
  const task=(async()=>{
    const bank=new Map<string,AudioBuffer>();let index=0;
    await Promise.all(Array.from({length:4},async()=>{
      while(index<VIRTUOSITY_KEYS.length){
        const key=VIRTUOSITY_KEYS[index++];
        const response=await fetch(`/audio/virtuosity/${key}.mp3`,{signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Error('Rock drum samples could not load. Check your connection and try Play again.');
        bank.set(key,await context.decodeAudioData(await response.arrayBuffer()));
      }
    }));
    metalBanks.set(context,bank);
  })().finally(()=>metalPending.delete(context));
  metalPending.set(context,task);return task;
}
export function metalDrumSample(context:AudioContext,instrument:DrumInstrument,velocity:number,take:number){
  return metalBanks.get(context)?.get(`${instrument}-${velocity<.5?0:1}-${take%2+1}`);
}
