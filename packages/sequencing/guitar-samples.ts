/** Sparse, CC0 FreePats classical guitar samples prepared by scripts/prepare-guitar-samples.mjs. */
export const GUITAR_SAMPLE_ROOTS=[40,41,45,48,50,52,54,56,58,60,62,64,66,69,70,72,74,76,78,80,82,84] as const;
const banks=new WeakMap<BaseAudioContext,Map<number,AudioBuffer>>();
const pending=new WeakMap<BaseAudioContext,Promise<void>>();

export function guitarSampleRoot(pitch:number):number {
  return GUITAR_SAMPLE_ROOTS.reduce<number>((best,root)=>Math.abs(root-pitch)<Math.abs(best-pitch)?root:best,GUITAR_SAMPLE_ROOTS[0]);
}

export function loadGuitarSamples(context:AudioContext):Promise<void> {
  if(banks.has(context))return Promise.resolve();
  const existing=pending.get(context);if(existing)return existing;
  const task=(async()=>{
    const bank=new Map<number,AudioBuffer>();let index=0;
    await Promise.all(Array.from({length:4},async()=>{
      while(index<GUITAR_SAMPLE_ROOTS.length){
        const root=GUITAR_SAMPLE_ROOTS[index++];
        const response=await fetch(`/audio/classical-guitar/${root}.mp3`,{signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw Error("Guitar samples could not load");
        bank.set(root,await context.decodeAudioData(await response.arrayBuffer()));
      }
    }));
    banks.set(context,bank);
  })().finally(()=>pending.delete(context));
  pending.set(context,task);return task;
}

export function guitarSample(context:AudioContext,pitch:number) {
  const adjustedPitch=pitch<40?pitch+12:pitch;
  const root=guitarSampleRoot(adjustedPitch);
  const buffer=banks.get(context)?.get(root);
  return buffer?{buffer,rate:Math.pow(2,(adjustedPitch-root)/12)}:null;
}
