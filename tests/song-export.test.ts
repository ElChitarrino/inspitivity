import assert from "node:assert/strict";
import test from "node:test";
import { exportSongMidi } from "../packages/workspace/song-export.js";
import type { Project } from "../packages/workspace/index.js";

test("song export separates saved instruments and retains section repeats",()=>{
  const project:Project={id:"p",name:"Song",bpm:110,meter:"4/4",key:"C major",updated:0,sections:[{
    id:"s",name:"Verse",bars:1,repeats:2,color:"blue",ideas:[
      {id:"c",type:"chords",name:"Chord",detail:"C",voice:"acoustic guitar",data:["C|4|48,52,55"]},
      {id:"d",type:"drums",name:"Beat",detail:"",voice:"current",data:["kick|0|.8|4"]},
      {id:"b",type:"bass",name:"Bass",detail:"",voice:"deep bass",data:["36|0|1|.8"]},
    ],
  }]};
  const bytes=exportSongMidi(project);
  const data=new TextDecoder().decode(bytes);
  assert.ok(data.includes("MThd"));
  assert.equal(data.match(/MTrk/g)?.length,4); // conductor, chords, bass, drums
  assert.ok(data.includes("Verse 1/2")&&data.includes("Verse 2/2"));
  assert.ok(bytes.includes(0x99)); // drum note-on on MIDI channel 10
});
