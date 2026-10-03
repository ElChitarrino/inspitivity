import assert from "node:assert/strict";
import test from "node:test";
import { chordIntervals, generateChordProgression, getScale, notePitchClass } from "../packages/music-theory/index.js";
import { buildSketchGroove, chooseSketchGroove, chooseSketchHarmony, heavyPowerVoicing, shapeSketchMotif, type SketchStyle } from "../packages/workspace/sketch-grammar.js";
import { meterBeats } from "../packages/prog/index.js";
import { buildSongPlan } from "../packages/workspace/music.js";
import type { Project } from "../packages/workspace/index.js";

test("emotion-led progressions vary within a style, preserve a clear return and fit the selected mode",()=>{
  const styles: SketchStyle[]=["emotive","rock","neo-soul","funk","prog","heavy"];
  for(const style of styles){
    const patterns=Array.from({length:12},(_,seed)=>chooseSketchHarmony(style,style==="heavy"?"phrygian":"ionian",seed));
    assert.ok(new Set(patterns.map(pattern=>pattern.degrees.join())) .size>=3,style);
    const theme=chooseSketchHarmony(style,"ionian",4), contrast=chooseSketchHarmony(style,"ionian",4,1);
    assert.notDeepEqual(theme.degrees,contrast.degrees);
    const scale=new Set(getScale("C","ionian").map(notePitchClass));
    const chords=generateChordProgression({root:"C",mode:"ionian",bars:4,complexity:"medium",seed:4,degreePattern:theme.degrees});
    assert.deepEqual(chords.map(chord=>chord.degree),theme.degrees);
    assert.ok(chords.every(chord=>chordIntervals(chord.name).every(interval=>scale.has((chord.pitch+interval)%12))),style);
  }
});

test("a rock backbeat stays predictable while the seeded pattern changes",()=>{
  const signatures=new Set<string>();
  for(let seed=0;seed<12;seed++){
    const groove=chooseSketchGroove("rock",4,seed);
    signatures.add(groove.name);
    const hits=buildSketchGroove(groove,4,4,seed,"balanced","theme");
    assert.deepEqual(hits.filter(hit=>hit.instrument==="snare"&&hit.velocity>.6).map(hit=>hit.step),[4,12,20,28,36,44,52,60]);
    assert.deepEqual(hits.filter(hit=>hit.instrument==="kick"&&hit.step%16===0).map(hit=>hit.step),[0,16,32,48]);
  }
  assert.ok(signatures.size>=3);
});

test("heavy harmony uses guitar-range roots, fifths and octaves, leaving thirds to other parts",()=>{
  assert.deepEqual(heavyPowerVoicing("Em"),[40,47,52]);
  assert.deepEqual(heavyPowerVoicing("Fmaj7"),[41,48,53]);
  assert.deepEqual(heavyPowerVoicing("Ebm"),[39,46,51]);
});

test("soul groove has audible off-grid swing and soft ghost strokes; funk has syncopated kicks",()=>{
  for(const style of ["neo-soul","funk"] as const){
    const groove=chooseSketchGroove(style,4,2);
    const hits=buildSketchGroove(groove,4,2,5,"balanced","theme");
    assert.ok(hits.some(hit=>hit.instrument==="snare"&&hit.velocity<.4));
    assert.ok(hits.some(hit=>hit.instrument==="kick"&&hit.step%4!==0));
    if(style==="neo-soul"){
      assert.ok(hits.some(hit=>hit.instrument==="hihat"&&!Number.isInteger(hit.step)),"swung offbeats survive in saved timing");
      assert.ok(hits.some(hit=>hit.instrument==="snare"&&hit.velocity>.6&&hit.step%1>.1),"the soul backbeat sits behind the beat");
    } else {
      const hats=hits.filter(hit=>hit.instrument==="hihat");
      const offbeats=hats.filter(hit=>hit.step%4!==0);
      assert.ok(offbeats.length>0&&offbeats.every(hit=>hit.velocity>hats.find(onbeat=>onbeat.step===Math.floor(hit.step/4)*4)!.velocity),"funk offbeat hats carry the lift");
    }
  }
});

test("a saved swung neo-soul hat stays late in the actual song plan",()=>{
  const hits=buildSketchGroove(chooseSketchGroove("neo-soul",4,2),4,1,5,"balanced","theme");
  const swung=hits.find(hit=>hit.instrument==="hihat"&&!Number.isInteger(hit.step));
  assert.ok(swung);
  const project:Project={id:"soul",name:"Soul test",key:"E Dorian",bpm:100,meter:"4/4",updated:0,sections:[{
    id:"pocket",name:"Pocket",bars:1,color:"mint",ideas:[{id:"drums",type:"drums",name:"Soul drums",detail:"",data:hits.map(hit=>`${hit.instrument}|${hit.step}|${hit.velocity}|4`)}],
  }]};
  const plan=buildSongPlan(project);
  assert.ok(plan.events.some(event=>event.layer==="drums"&&event.pitch===42&&Math.abs(event.start-swung.step/4)<.001));
});

test("changing meter keeps the chosen feel rather than replacing it with another genre",()=>{
  const soul=chooseSketchGroove("neo-soul",7,8);
  const funk=chooseSketchGroove("funk",6,8);
  assert.match(soul.name,/soul/);
  assert.match(funk.name,/funk/);
  assert.ok(buildSketchGroove(soul,7,2,8,"balanced","theme").some(hit=>hit.instrument==="hihat"&&!Number.isInteger(hit.step)));
});

test("motifs retain a four-bar boundary and odd-meter grooves remain inside their sections",()=>{
  for(const [style,timeSignature] of [["emotive","6/8"],["rock","4/4"],["prog","7/8"],["heavy","9/8"]] as const){
    const meter=meterBeats(timeSignature);
    const count=style==="emotive"?12:16;
    const notes=shapeSketchMotif(Array.from({length:count},(_,index)=>({pitch:60+index%5,start:index,duration:.5,velocity:.7})),style,meter,12);
    assert.equal(notes.at(-1)!.start+notes.at(-1)!.duration,meter*4);
    assert.ok(notes.every((note,index)=>index===0||note.start>notes[index-1].start));
    assert.ok(notes.every((note,index)=>Math.floor(index*4/count)*meter<=note.start&&note.start<(Math.floor(index*4/count)+1)*meter),timeSignature);
    const hits=buildSketchGroove(chooseSketchGroove(style,meter,12),meter,4,15,"powerful","return");
    assert.ok(hits.every(hit=>hit.step>=0&&hit.step<meter*16&&hit.velocity>=.2&&hit.velocity<=1));
    assert.ok([0,1,2,3].every(bar=>hits.some(hit=>hit.instrument==="kick"&&hit.step===bar*meter*4)));
  }
  const sparse=shapeSketchMotif(Array.from({length:9},()=>({start:0,duration:.5,velocity:.7})),"emotive",6,3);
  assert.ok(sparse.some(note=>note.start>=18&&note.start<24),"uneven phrases still have a fourth bar");
  assert.equal(sparse.at(-1)!.start+sparse.at(-1)!.duration,24);
});
