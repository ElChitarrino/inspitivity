/** Calibrate sample banks to comparable attack energy with conservative gain bounds. */
export function measuredSampleGain(channels:readonly Float32Array[],sampleRate:number,targetRms:number){
  const frames=Math.min(channels[0]?.length??0,Math.max(1,Math.round(sampleRate*.18)));
  if(!frames||!channels.length)return 1;
  let sum=0,peak=0;
  for(const channel of channels)for(let i=0;i<frames;i++){const n=channel[i]??0;sum+=n*n;peak=Math.max(peak,Math.abs(n));}
  const rms=Math.sqrt(sum/(frames*channels.length));
  if(rms<.0001)return 1;
  return Math.max(.25,Math.min(1.7,targetRms/rms,peak>0?.95/peak:1.7));
}
const gains=new WeakMap<AudioBuffer,Map<string,number>>();
export function samplePlaybackGain(buffer:AudioBuffer,family:'drum'|'guitar'){
  let cache=gains.get(buffer);if(!cache){cache=new Map();gains.set(buffer,cache);}
  let gain=cache.get(family);
  if(gain===undefined){gain=measuredSampleGain(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate,family==='drum'?.16:.12);cache.set(family,gain);}
  return gain;
}
