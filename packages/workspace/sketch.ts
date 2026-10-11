/** Fit a generated phrase to a musical cycle while keeping its note order and grid. */
export function alignPhrase<T extends { start:number; duration:number }>(notes:T[], beats:number):T[] {
  if(!notes.length || beats<=0)return [];
  const end=Math.max(...notes.map(note=>note.start+note.duration));
  const ratio=beats/Math.max(.25,end);
  const snap=(value:number)=>Math.round(value*4)/4;
  return notes.map(note=>{
    const start=Math.min(beats-.25,Math.max(0,snap(note.start*ratio)));
    const finalNote=Math.abs(note.start+note.duration-end)<.001;
    const duration=finalNote ? beats-start : Math.max(.25,Math.min(beats-start,snap(note.duration*ratio)));
    return {...note,start,duration};
  });
}
