export function reorderSection<T extends {id: string}>(items: readonly T[], source: string, target: string) {
  const from=items.findIndex(item=>item.id===source), to=items.findIndex(item=>item.id===target);
  if(from<0 || to<0 || from===to)return [...items];
  const next=[...items];
  next.splice(to,0,next.splice(from,1)[0]);
  return next;
}

/** Transport beat duration including repeats. The app's BPM counts denominator beats. */
export function timelineDuration(section: {bars:number; repeats?:number; meterMap?:string[]}, meter:string) {
  const beats=(value:string)=>Number(value.split('/')[0])||4;
  return Array.from({length:section.bars},(_,i)=>beats(section.meterMap?.length ? section.meterMap[i%section.meterMap.length] : meter)).reduce((a,b)=>a+b,0)*(section.repeats??1);
}
