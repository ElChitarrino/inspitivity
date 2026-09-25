import assert from "node:assert/strict";
import test from "node:test";
import {generateMelody} from "../packages/music-theory/index.js";
import {voiceProgression} from "../packages/music-theory/voicing.js";
import {chordNoteEvents, generateChordRhythm} from "../packages/music-theory/chord-rhythm.js";
import {generateDrumLoop} from "../packages/sequencing/index.js";
import {generateBassPhrase} from "../packages/workspace/bass.js";
import {buildSongPlan} from "../packages/workspace/music.js";
import {exportSongMidi} from "../packages/workspace/song-export.js";
import type {Project} from "../packages/workspace/index.js";

for(const [meter,beats,root,mode] of [["4/4",4,"C","major"],["7/8",7,"E","dorian"]] as const){
  test(`generated ${meter} section keeps harmony, groove, bass, and melody through playback and export`,()=>{
    const symbols=root==="C"?["Cmaj7","Am7","Fmaj7","G7"]:["Em7","Gmaj7","A7","Bm7"];
    const pitches=voiceProgression(symbols,43,"mixed");
    const rhythm=generateChordRhythm(symbols.map(()=>({beats})),{seed:43,style:"quarters",beatsPerBar:beats});
    const chords=symbols.map((name,index)=>({name,beats,pitches:pitches[index],attacks:rhythm[index]}));
    const drums=generateDrumLoop({beatsPerBar:beats,bars:4,density:.56,style:"steady",energy:"balanced",seed:43});
    const bass=generateBassPhrase({length:4*beats,meter,root,mode,harmony:chords.map(chord=>({symbol:chord.name,beats:chord.beats})),direction:"groove",movement:"supportive",lockToKick:true,kickStarts:drums.filter(hit=>hit.instrument==="kick").map(hit=>hit.step/4),kickCycle:beats,seed:71});
    const melody=generateMelody({root,mode,notes:18,density:.55,seed:83});
    const project:Project={id:"generated",name:"Generated song",key:`${root} ${mode}`,bpm:112,meter,updated:0,sections:[{id:"verse",name:"Verse",bars:4,color:"mint",ideas:[
      {id:"chords",type:"chords",name:"Harmony",detail:symbols.join(" · "),voice:"acoustic guitar",data:chords.map(chord=>`${chord.name}|${chord.beats}|${chord.pitches.join(",")}|${chord.attacks.map(attack=>`${attack.start},${attack.duration},${attack.velocity},${attack.up?1:0}`).join(";")}`)},
      {id:"drums",type:"drums",name:"Groove",detail:"",data:drums.map(hit=>`${hit.instrument}|${hit.step}|${hit.velocity}|${4*beats}`)},
      {id:"bass",type:"bass",name:"Bass",detail:"",data:bass.map(note=>`${note.pitch}|${note.start}|${note.duration}|${note.accent?1:0}`)},
      {id:"melody",type:"melody",name:"Melody",detail:"",data:melody.map(note=>`${note.note}|${note.start}|${note.duration}|${note.pitch}`)},
    ]}]};
    const plan=buildSongPlan(project);
    assert.deepEqual(new Set(plan.events.map(event=>event.layer)),new Set(["chords","drums","bass","melody"]));
    assert.equal(plan.markers.length,4);
    assert.equal(plan.seconds,4*beats*60/112);
    assert.ok(plan.events.every(event=>event.seconds>=0&&event.seconds+event.secondsDuration<=plan.seconds+.0001));
    const exported=new TextDecoder().decode(exportSongMidi(project));
    assert.equal(exported.match(/MTrk/g)?.length,5);
    assert.ok(exported.includes("Verse"));
    // A single clicked chord schedules each assigned attack and ends at its saved span.
    const audition=chordNoteEvents([chords[0]]);
    assert.ok(new Set(audition.map(note=>Math.floor(note.start))).size>=2);
    assert.ok(audition.every(note=>note.start+note.duration<=beats+.0001));
  });
}
