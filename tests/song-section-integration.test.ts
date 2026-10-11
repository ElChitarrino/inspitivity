import assert from "node:assert/strict";
import test from "node:test";
import {generateMelody} from "../packages/music-theory/index.js";
import {voiceProgression} from "../packages/music-theory/voicing.js";
import {chordNoteEvents, generateChordRhythm} from "../packages/music-theory/chord-rhythm.js";
import {generateDrumLoop} from "../packages/sequencing/index.js";
import {generateBassPhrase} from "../packages/workspace/bass.js";
import {buildSongPlan,feelVelocity} from "../packages/workspace/music.js";
import {validProjects} from "../packages/workspace/index.js";
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

for(const beats of [9,12]){
  test(`${beats}/8 harmony stays aligned to every bar and the bass`,()=>{
    const symbols=["Cmaj7","Am7","Fmaj7","G7"];
    const chords=symbols.map((name)=>({symbol:name,beats}));
    const bass=generateBassPhrase({length:beats*4,meter:`${beats}/8`,root:"C",mode:"major",harmony:chords,direction:"sustained",movement:"rooted",lockToKick:false,seed:33});
    const project:Project={id:"compound",name:"Compound",key:"C major",bpm:110,meter:`${beats}/8`,updated:0,sections:[{id:"verse",name:"Verse",bars:4,color:"mint",ideas:[
      {id:"h",type:"chords",name:"Harmony",detail:"",data:chords.map(chord=>`${chord.symbol}|${chord.beats}`)},
      {id:"b",type:"bass",name:"Bass",detail:"",data:bass.map(note=>`${note.pitch}|${note.start}|${note.duration}|${note.accent?1:0}`)},
    ]}]};
    const events=buildSongPlan(project).events;
    const downbeats=[0,1,2,3].map(bar=>bar*beats/2); // 8th-note beats become quarter-note positions.
    assert.deepEqual([...new Set(events.filter(event=>event.layer==="chords").map(event=>event.start))],downbeats);
    assert.ok(downbeats.every(start=>events.some(event=>event.layer==="bass"&&event.start===start)));
    assert.equal(buildSongPlan(project).markers.length,4);
  });
}

test("five section feels retain saved notes and shape playback intensity",()=>{
  const values=["sparse","mellow","balanced","driving","powerful"] as const;
  const velocities=values.map(energy=>feelVelocity("drums",energy,.6));
  assert.deepEqual([...velocities].sort((a,b)=>a-b),velocities);
  const section={id:"a",name:"A",bars:1,color:"mint",ideas:[{id:"d",type:"drums" as const,name:"Drums",detail:"",data:["kick|0|0.7|4","hihat|2|0.5|4","snare|4|0.8|4"]}]};
  const project:Project={id:"p",name:"Song",bpm:120,key:"C ionian",meter:"4/4",updated:1,sections:[section]};
  for(const energy of values)assert.ok(validProjects([{...project,sections:[{...section,energy}]}]));
  const sparse=buildSongPlan({...project,sections:[{...section,energy:"sparse"}]});
  const balanced=buildSongPlan({...project,sections:[{...section,energy:"balanced"}]});
  assert.ok(sparse.events.length<balanced.events.length);
  assert.deepEqual(project.sections[0].ideas[0].data,section.ideas[0].data);
});
