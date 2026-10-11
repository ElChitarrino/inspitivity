import assert from "node:assert/strict";
import test from "node:test";
import {adaptAccompaniment,harmonyChanged} from "../packages/workspace/harmony-adapt.js";
import {buildSongPlan} from "../packages/workspace/music.js";
import type {Project,SongSection} from "../packages/workspace/index.js";

const section:SongSection={id:"v",name:"Verse",bars:2,color:"mint",energy:"balanced",ideas:[
  {id:"c",type:"chords",name:"Chords",detail:"C G",data:["C|4|48,52,55","G|4|43,47,50"]},
  {id:"b",type:"bass",name:"Bass",detail:"",data:["36|0|1|1","43|4|1|1","40|5|.5|0"]},
  {id:"m",type:"melody",name:"Melody",detail:"",data:["E4|0|1|64","D4|4|1|62","F4|4.5|.25|65"]},
  {id:"d",type:"drums",name:"Beat",detail:"",data:["kick|0|.8|8","hihat|2|.65|8","hihat|4|.65|8","snare|4|.8|8"]},
]};
const next=["Dm|4|50,53,57","Am|4|45,48,52"];

test("a harmony change can adapt bass and accented lead while preserving rhythm and source",()=>{
  assert.equal(harmonyChanged(section.ideas[0].data!,next),true);
  assert.equal(harmonyChanged(section.ideas[0].data!,["C|4|60,64,67","G|4|55,59,62"]),false);
  const source=JSON.stringify(section);
  const adapted=adaptAccompaniment(section,next);
  assert.deepEqual(adapted.ideas.find(idea=>idea.type==="bass")?.data?.map(value=>value.split("|").slice(1)),section.ideas[1].data?.map(value=>value.split("|").slice(1)));
  assert.equal(Number(adapted.ideas[1].data![0].split("|")[0])%12,2);
  assert.equal(Number(adapted.ideas[1].data![1].split("|")[0])%12,9);
  assert.equal(Number(adapted.ideas[2].data![0].split("|")[3])%12,5);
  assert.equal(adapted.ideas[2].data![2],section.ideas[2].data![2],"short passing note remains intact");
  assert.deepEqual(adapted.ideas[3],section.ideas[3],"drums remain untouched");
  assert.equal(JSON.stringify(section),source);
});

test("section feel changes scheduled performance without deleting saved notes",()=>{
  const project=(energy:SongSection["energy"]):Project=>({id:"p",name:"song",key:"C major",bpm:120,meter:"4/4",updated:0,sections:[{...section,energy}]});
  const balanced=buildSongPlan(project("balanced"));
  const mellow=buildSongPlan(project("mellow"));
  const powerful=buildSongPlan(project("powerful"));
  const firstKick=(plan:typeof balanced)=>plan.events.find(event=>event.layer==="drums"&&event.pitch===36)!.velocity;
  assert.ok(firstKick(mellow)<firstKick(balanced));
  assert.ok(firstKick(powerful)>firstKick(balanced));
  assert.ok(mellow.events.filter(event=>event.pitch===42).length<balanced.events.filter(event=>event.pitch===42).length);
  assert.deepEqual(project("balanced").sections[0].ideas,project("mellow").sections[0].ideas);
});
