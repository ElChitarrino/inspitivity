import {DRUM_INSTRUMENTS,type DrumInstrument} from './index.js';
export const DRUM_KITS = ['acoustic studio','dry studio','rock','prog metal','roomy rock','dark acoustic','current'] as const;
export type DrumKit = typeof DRUM_KITS[number];
export const DRUM_KIT_LABELS:Record<DrumKit,string>={
  'acoustic studio':'Acoustic studio · samples','dry studio':'Dry studio · samples',rock:'Rock · samples','prog metal':'Progressive metal · samples','roomy rock':'Roomy rock · samples','dark acoustic':'Dark acoustic · samples',current:'Electronic · original synth',
};
export const DRUM_SAMPLE_KEYS=DRUM_INSTRUMENTS.flatMap(piece=>[0,1].flatMap(layer=>[1,2].map(take=>`${piece}-${layer}-${take}`)));
const banks=new WeakMap<BaseAudioContext,Map<string,AudioBuffer>>();
const pending=new WeakMap<BaseAudioContext,Promise<void>>();
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
