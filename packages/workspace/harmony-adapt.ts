import {chordIntervals, notePitchClass} from "../music-theory/index.js";
import {decodeRhythmicChord} from "../music-theory/chord-rhythm.js";
import type {SongSection} from "./index.js";

type Chord = ReturnType<typeof decodeRhythmicChord>;
const pitchClass=(pitch:number)=>((pitch%12)+12)%12;
const shortestShift=(from:number,to:number)=>((to-from+18)%12)-6;
const chordAt=(chords:Chord[],beat:number)=>{
  const length=chords.reduce((sum,chord)=>sum+chord.beats,0);
  if(!length)return undefined;
  const position=((beat%length)+length)%length;
  let cursor=0;
  for(const chord of chords){if(position<cursor+chord.beats)return {chord,start:cursor,position};cursor+=chord.beats;}
  return {chord:chords.at(-1)!,start:cursor-chords.at(-1)!.beats,position};
};
const nearestChordTone=(pitch:number,chord:Chord)=>{
  const root=notePitchClass(chord.name);
  if(root===null)return pitch;
  const tones=new Set(chordIntervals(chord.name).map(interval=>(root+interval)%12));
  return Array.from({length:25},(_,index)=>pitch+index-12)
    .filter(candidate=>tones.has(pitchClass(candidate)))
    .sort((a,b)=>Math.abs(a-pitch)-Math.abs(b-pitch))[0]??pitch;
};

export function harmonyChanged(before:string[],after:string[]) {
  const signature=(data:string[])=>data.map(encoded=>{
    const chord=decodeRhythmicChord(encoded);
    return `${chord.name}:${chord.beats}`;
  }).join("|");
  return signature(before)!==signature(after);
}

/** Preserve accompaniment rhythm and melodic contour while following new harmony. */
export function adaptAccompaniment(section:SongSection,newChordData:string[]):SongSection {
  const original=section.ideas.find(idea=>idea.type==="chords")?.data;
  if(!original?.length||!newChordData.length||!harmonyChanged(original,newChordData))return section;
  const before=original.map(decodeRhythmicChord),after=newChordData.map(decodeRhythmicChord);
  return {...section,ideas:section.ideas.map(idea=>{
    if(!["bass","melody","riff"].includes(idea.type)||!idea.data?.length)return idea;
    return {...idea,data:idea.data.map(encoded=>{
      const fields=encoded.split("|");
      const pitchIndex=idea.type==="melody"?3:0;
      const pitch=Number(fields[pitchIndex]),beat=Number(fields[1]);
      if(!Number.isFinite(pitch)||!Number.isFinite(beat))return encoded;
      const previous=chordAt(before,beat),next=chordAt(after,beat);
      const oldRoot=previous&&notePitchClass(previous.chord.name);
      const newRoot=next&&notePitchClass(next.chord.name);
      if(!previous||!next||oldRoot==null||newRoot==null)return encoded;
      let adapted=pitch;
      if(idea.type==="bass"){
        adapted=pitch+shortestShift(oldRoot,newRoot);
        while(adapted<23)adapted+=12;
        while(adapted>55)adapted-=12;
      } else {
        const oldTones=new Set(chordIntervals(previous.chord.name).map(interval=>(oldRoot+interval)%12));
        const chordChange=Math.abs(next.position-next.start)<.1;
        const accented=idea.type==="riff"?fields[3]==="1":Math.abs(beat-Math.round(beat))<.08;
        if(oldTones.has(pitchClass(pitch))&&(chordChange||accented)){
          const shifted=pitch+shortestShift(oldRoot,newRoot);
          adapted=nearestChordTone(shifted,next.chord);
        }
      }
      if(adapted===pitch)return encoded;
      fields[pitchIndex]=String(adapted);
      if(idea.type==="melody"){
        const names=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
        fields[0]=`${names[pitchClass(adapted)]}${Math.floor(adapted/12)-1}`;
      }
      return fields.join("|");
    })};
  })};
}
