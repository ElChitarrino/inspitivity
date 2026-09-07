export type VariationKind = "subtle" | "space" | "energy";
export type VariationLocks = { rhythm: boolean; notes: boolean };
export function varyNotes<T extends { pitch: number; start: number; duration: number }>(notes: T[], kind: VariationKind, locks: VariationLocks, scale: number[], seed: number): T[] {
  let result=notes.map(n=>({...n}));
  if (!locks.notes && result.length > 1) {
    const index=1+(Math.abs(seed)%(result.length-1)), old=result[index].pitch;
    const candidates=Array.from({length:7},(_,i)=>old+i-3).filter(p=>p!==old && scale.includes(((p%12)+12)%12));
    if (candidates.length) result[index].pitch=candidates[Math.abs(seed)%candidates.length];
  }
  if (!locks.rhythm && kind === "space" && result.length > 3) result=result.filter((_,i)=>i%4!==2);
  if (!locks.rhythm && kind === "energy") {
    const index=result.findIndex(n=>n.duration>=.5);
    if(index>=0) {
      const n=result[index], half=n.duration/2;
      result.splice(index,1,{...n,duration:half*.9},{...n,start:n.start+half,duration:half*.9});
    }
  }
  return result;
}
