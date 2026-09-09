export type VariationKind = "subtle" | "space" | "energy";
export type VariationLocks = { rhythm: boolean; notes: boolean };
export function varyNotes<T extends { pitch: number; start: number; duration: number }>(notes: T[], kind: VariationKind, locks: VariationLocks, scale: number[], seed: number): T[] {
  let result=notes.map(n=>({...n}));
  if (!locks.notes && result.length > 1 && scale.length) {
    const changeCount=Math.min(result.length-1,Math.max(2,Math.ceil(result.length*(kind==="subtle"?.22:.34))));
    const indices=Array.from({length:changeCount},(_,offset)=>1+((Math.abs(seed)+offset*3)%(result.length-1)));
    for(const [offset,index] of [...new Set(indices)].entries()) {
      const old=result[index].pitch;
      const candidates=Array.from({length:25},(_,i)=>old+i-12).filter(p=>p!==old&&scale.includes(((p%12)+12)%12)).sort((a,b)=>Math.abs(a-old)-Math.abs(b-old));
      if(candidates.length) result[index].pitch=candidates[(Math.abs(seed)+offset)%Math.min(4,candidates.length)];
    }
  }
  if (!locks.rhythm && kind === "subtle" && result.length > 2) result=result.map((note,index)=>index>0&&index%3===Math.abs(seed)%3?{...note,start:Math.max(0,note.start+(index%2?.125:-.125)),duration:Math.max(.125,note.duration*(index%2?.85:1.15))}:note).sort((a,b)=>a.start-b.start);
  if (!locks.rhythm && kind === "space" && result.length > 3) {
    result=result.filter((_,i)=>i%4!==2).map((note,index,array)=>index<array.length-1?{...note,duration:Math.min(note.duration*1.35,Math.max(.125,array[index+1].start-note.start-.05))}:note);
  }
  if (!locks.rhythm && kind === "energy") {
    const splittable=result.map((note,index)=>({note,index})).filter(({note})=>note.duration>=.5).slice(0,Math.max(1,Math.ceil(result.length/8))).reverse();
    for(const {index} of splittable) {
      const n=result[index], half=n.duration/2;
      result.splice(index,1,{...n,duration:half*.88},{...n,start:n.start+half,duration:half*.88});
    }
  }
  return result;
}

export function varyIdeaData(type:string,data:string[],seed:number):string[] {
  if(data.length<2) return [...data];
  if(type==="chords") {
    const next=[...data];
    if(next.length>2) [next[next.length-2],next[next.length-1]]=[next[next.length-1],next[next.length-2]];
    return next.map((value,index)=>{
      const fields=value.split("|");
      const pitches=(fields[2]??"").split(",").map(Number).filter(Number.isFinite);
      if(pitches.length>2&&index%2===Math.abs(seed)%2) fields[2]=[...pitches.slice(1),Math.min(96,pitches[0]+12)].join(",");
      return fields.join("|");
    });
  }
  if(type==="drums") {
    let next=data.map((value,index)=>{const fields=value.split("|");fields[2]=String(Math.max(.2,Math.min(1,(Number(fields[2])||.7)*(index%3===0?1.12:.84))));return fields.join("|");});
    next=next.filter((value,index)=>!value.startsWith("hihat|")||index%4!==2);
    const source=next.find(value=>value.startsWith("hihat|"));
    if(source){const fields=source.split("|");fields[1]=String((Number(fields[1])||0)+2);fields[2]="0.42";next.push(fields.join("|"));}
    return next;
  }
  if(type==="melody"||type==="riff"||type==="bass") {
    const pitchIndex=type==="melody"?3:0;
    const parsed=data.map((value,index)=>{const fields=value.split("|");return {fields,pitch:Number(fields[pitchIndex])||60,start:Number(fields[1])||index*.5,duration:Number(fields[2])||.4};});
    const scale=[...new Set(parsed.map(note=>((note.pitch%12)+12)%12))];
    const varied=varyNotes(parsed,"subtle",{rhythm:false,notes:false},scale,seed);
    return varied.map(note=>{const fields=[...note.fields];fields[pitchIndex]=String(note.pitch);if(type==="melody")fields[0]=`${["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"][((note.pitch%12)+12)%12]}${Math.floor(note.pitch/12)-1}`;fields[1]=String(Number(note.start.toFixed(3)));fields[2]=String(Number(note.duration.toFixed(3)));if(type!=="melody"&&fields[3]!==undefined&&Math.round(note.start*2)%4===0)fields[3]=fields[3]==="1"?"0":"1";return fields.join("|");});
  }
  return [...data];
}
