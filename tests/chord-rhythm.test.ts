import assert from "node:assert/strict";
import test from "node:test";
import { CHORD_RHYTHMS, chordNoteEvents, decodeRhythmicChord, encodeChordAttacks, generateChordRhythm } from "../packages/music-theory/chord-rhythm.js";
import { buildSongPlan } from "../packages/workspace/music.js";
import type { Project } from "../packages/workspace/index.js";

const chords = ["Am7","Fmaj7","Cmaj7","G7"].map(name=>({name,beats:4,pitches:[48,52,55,59]}));
test("named chord rhythms have explicit, seed-independent attack positions",()=>{
  const expected={sustain:[0],quarters:[0,1,2,3],eighths:[0,.5,1,1.5,2,2.5,3,3.5],offbeat:[.5,1.5,2.5,3.5],backbeat:[1,3],tresillo:[0,1.5,3]};
  for(const [style,starts] of Object.entries(expected))for(const seed of [1,19,721]){
    const hits=generateChordRhythm(chords,{seed,style:style as typeof CHORD_RHYTHMS[number]});
    assert.ok(hits.every(chord=>JSON.stringify(chord.map(h=>h.start))===JSON.stringify(starts)));
  }
});
test("rhythm generation is repeatable, varied across seeds, and not locked to chord downbeats",()=>{
  assert.deepEqual(generateChordRhythm(chords,{seed:11}),generateChordRhythm(chords,{seed:11}));
  const results=Array.from({length:50},(_,seed)=>generateChordRhythm(chords,{seed}));
  assert.ok(new Set(results.map(r=>JSON.stringify(r))).size>=45);
  assert.ok(results.some(r=>r.some(hits=>hits.every(h=>h.start!==0))));
  assert.ok(results.some(r=>r.some(hits=>hits.some(h=>h.start<0))));
  assert.ok(results.some(r=>r.some(hits=>hits.length>2)));
});
test("every rhythm respects short chords and odd or compound meters",()=>{
  for(const beats of [.5,1,3,5,6,7,9]) for(const style of CHORD_RHYTHMS){
    const result=generateChordRhythm([{beats},{beats}],{seed:91,style,beatsPerBar:beats});
    assert.ok(result.every(hits=>hits.length>0&&hits.every(h=>h.start>=-.5&&h.start<beats&&h.duration>0&&h.start+h.duration<=beats&&h.velocity>0&&h.velocity<=1)));
  }
});
test("adaptive rhythm responds to the saved drum pocket",()=>{
  const without=generateChordRhythm(chords,{seed:9});
  const withDrums=generateChordRhythm(chords,{seed:9,kickSteps:[0,6,10,14],snareSteps:[4,12]});
  assert.notDeepEqual(without,withDrums);
});
test("saved rhythms round trip and legacy chords remain sustained",()=>{
  const attacks=generateChordRhythm(chords,{seed:19})[0];
  const decoded=decodeRhythmicChord(`Am7|4|48,52,55,59|${encodeChordAttacks(attacks)}`);
  assert.deepEqual(decoded.attacks,attacks);
  const legacy=chordNoteEvents([decodeRhythmicChord("Am7|4|48,52,55,59")]);
  assert.equal(legacy.length,4);assert.ok(legacy.every(n=>n.start===0&&n.duration===3.6));
  assert.equal(decodeRhythmicChord("Am7|4|48,52|NaN,1,1,0;999,1,1,0").attacks,undefined);
});
test("section arrangement events carry the same attacks as the chord preview and MIDI source",()=>{
  const rhythms=generateChordRhythm(chords,{seed:34});
  const rhythmic=chords.map((c,i)=>({...c,attacks:rhythms[i]}));
  const data=rhythmic.map(c=>`${c.name}|${c.beats}|${c.pitches.join(",")}|${encodeChordAttacks(c.attacks)}`);
  const project={id:"test",name:"rhythm",key:"A minor",bpm:120,meter:"4/4",sections:[{id:"verse",name:"Verse",bars:4,ideas:[{id:"chords",type:"chords",name:"Chords",detail:"",data}]}]} as Project;
  const expected=chordNoteEvents(rhythmic),actual=buildSongPlan(project).events;
  assert.equal(actual.length,expected.length);
  expected.forEach((n,i)=>{assert.equal(actual[i].pitch,n.pitch);assert.equal(actual[i].start,n.start);assert.ok(Math.abs(actual[i].duration-n.duration)<1e-9);});
});
