import assert from "node:assert/strict";
import test from "node:test";
import { chooseSketch, scoreSketch } from "../packages/workspace/sketch-quality.js";
import type { Project } from "../packages/workspace/index.js";

const project = (bass: string[], melody: string[]): Project => ({
  id:"test",name:"Test",bpm:120,meter:"4/4",key:"C major",updated:0,
  sections:[{id:"verse",name:"Verse",bars:2,color:"blue",energy:"balanced",ideas:[
    {id:"c",type:"chords",name:"Harmony",detail:"C",data:["C|4|60,64,67"]},
    {id:"d",type:"drums",name:"Beat",detail:"",data:["kick|0|.8|8","kick|8|.8|8"]},
    {id:"b",type:"bass",name:"Bass",detail:"",data:bass},
    {id:"m",type:"melody",name:"Melody",detail:"",data:melody},
  ]}],
});

test("quality selection rewards a grounded, spacious draft", () => {
  const grounded=project(["48|0|1|.7","48|2|1|.7"],["C4|0|1|60","E4|2|1|64"]);
  const crowded=project(Array.from({length:28},(_,i)=>`49|${i/4}|.2|.7`),Array.from({length:40},(_,i)=>`F#5|${i/6}|.15|78`));
  assert.ok(scoreSketch(grounded)>scoreSketch(crowded));
  assert.equal(chooseSketch([crowded,grounded]),grounded);
});

test("quality selection checks harmony at chord changes even between strums",()=>{
  const grounded=project(["48|0|1|1","43|4|1|1"],["E4|0|1|64","D4|4|1|62"]);
  grounded.sections[0].ideas[0].data=["C|4|48,52,55|.5,.3,.6,0","G|4|43,47,50|.5,.3,.6,0"];
  const wrong:Project=JSON.parse(JSON.stringify(grounded));
  wrong.sections[0].ideas.find(idea=>idea.type==="bass")!.data=["49|0|1|1","44|4|1|1"];
  assert.ok(scoreSketch(grounded)>scoreSketch(wrong));
});
