import assert from "node:assert/strict";
import test from "node:test";
import { mergeProjects, validProjects, type Project } from "../packages/workspace/index.js";
import { sectionFeel, buildSongPlan } from "../packages/workspace/music.js";
import { varyNotes } from "../packages/workspace/variation.js";
import { generateDrumLoop } from "../packages/sequencing/index.js";
import { createMultitrackMidi } from "../packages/midi/index.js";

const project = (): Project => ({ id:"p",name:"Idea",bpm:120,key:"C major",meter:"4/4",updated:1,sections:[{id:"s",name:"Verse",bars:2,color:"mint",ideas:[{id:"c",type:"chords",name:"Harmony",detail:"",data:["C|4","F|4"]}]}] });
test("cloud merge keeps both conflicting projects and propagates uncontested deletions",()=>{
  const base=project(), local={...base,name:"Device A"}, remote={...base,name:"Device B"};
  const result=mergeProjects([base],[local],[remote],()=>"conflict");
  assert.deepEqual(result.map(p=>p.id),["p","conflict"]);
  assert.equal(result[1].name,"Device A (conflict copy)");
  assert.deepEqual(mergeProjects([base],[],[base],()=>"x"),[]);
  assert.deepEqual(mergeProjects([base],[base],[],()=>"x"),[]);
  assert.equal(mergeProjects([base],[local],[],()=>"x")[0].name,"Device A (conflict copy)");
});
test("sync preserves independent device changes and is idempotent",()=>{
  const a=project(),b={...project(),id:"b"};
  const local=[{...a,name:"A changed"},b],remote=[a,{...b,name:"B changed"}];
  const result=mergeProjects([a,b],local,remote,()=>"x");
  assert.deepEqual(result.map(p=>p.name),["A changed","B changed"]);
  assert.deepEqual(mergeProjects(result,result,result,()=>"x"),result);
});
test("workspace validation rejects malformed or oversized musical records",()=>{
  assert.ok(validProjects([project()]));
  assert.equal(validProjects([{...project(),bpm:0}]),false);
  assert.equal(validProjects([project(),project()]),false);
  assert.equal(validProjects([{...project(),sections:[{...project().sections[0],ideas:[{type:"audio"}]}]}]),false);
});
test("section feel uses actual harmony and is independent of mood keywords",()=>{
  const p=project();
  assert.equal(sectionFeel(p,p.sections[0]).energy,"mellow");
  p.name="AGGRESSIVE HEAVY METAL";p.sections[0].ideas[0].name="Very heavy";
  assert.equal(sectionFeel(p,p.sections[0]).energy,"mellow");
  p.sections[0].ideas[0].data=["C|1","F|1"];
  assert.equal(sectionFeel(p,p.sections[0]).energy,"powerful");
});
test("odd meter pockets have real grouped accents within their bar",()=>{
  for (const beats of [3,5,6,7,9,11]) {
    const hits=generateDrumLoop({beatsPerBar:beats,style:"odd meter",seed:0,energy:"powerful"});
    assert.ok(hits.every(h=>h.step>=0 && h.step<beats*4));
    assert.ok(hits.some(h=>h.instrument==="kick"&&h.step===0));
    assert.ok(hits.some(h=>h.instrument==="snare"&&h.step%4===0));
  }
  const seven=generateDrumLoop({beatsPerBar:7,seed:0,energy:"powerful"});
  assert.deepEqual(seven.filter(h=>h.instrument==="snare"&&h.velocity>.6).map(h=>h.step),[8,24]);
});
test("controlled variations respect locked timing and pitches",()=>{
  const notes=[0,1,2,3].map((start,i)=>({pitch:60+i*2,start,duration:.8}));
  const locked=varyNotes(notes,"energy",{rhythm:true,notes:false},[0,2,4,5,7,9,11],2);
  assert.deepEqual(locked.map(n=>[n.start,n.duration]),notes.map(n=>[n.start,n.duration]));
  assert.notDeepEqual(locked.map(n=>n.pitch),notes.map(n=>n.pitch));
  assert.deepEqual(varyNotes(notes,"space",{rhythm:true,notes:true},[0,2,4],2),notes);
  assert.equal(varyNotes(notes,"space",{rhythm:false,notes:true},[0,2,4],2).length,3);
});
test("song plan repeats saved layers, preserves displaced starts, and leaves missing parts silent",()=>{
  const p=project();p.sections[0].ideas.push({id:"m",type:"melody",name:"Flute",detail:"",data:["E4|0.5|0.5|64"]});
  const plan=buildSongPlan(p);
  assert.equal(plan.quarters,8);assert.equal(plan.seconds,4);
  assert.deepEqual(plan.events.filter(e=>e.layer==="melody").map(e=>e.start),[.5,4.5]);
  assert.equal(plan.events.some(e=>e.layer==="drums"),false);
  assert.ok(plan.events.every(e=>e.start+e.duration<=8));
});
test("song MIDI contains a conductor and separate named instrument tracks",()=>{
  const p=project();p.meter="7/8";p.sections[0].bars=1;
  const plan=buildSongPlan(p);
  assert.equal(plan.quarters,3.5);assert.equal(plan.seconds,3.5);
  assert.equal(plan.markers[0].bpm,60,"export preserves the app's notated-beat tempo");
  const bytes=createMultitrackMidi({name:"Sketch",length:plan.quarters,markers:plan.markers,tracks:[{name:"Chords",channel:0,program:89,notes:plan.events}]});
  const view=new DataView(bytes.buffer);
  assert.equal(view.getUint16(8),1);assert.equal(view.getUint16(10),2);assert.equal(view.getUint16(12),480);
  let pos=14,count=0;
  while(pos<bytes.length){assert.equal(new TextDecoder().decode(bytes.slice(pos,pos+4)),"MTrk");pos+=8+view.getUint32(pos+4);count++;}
  assert.equal(count,2);assert.equal(pos,bytes.length);
  assert.ok(new TextDecoder().decode(bytes).includes("Verse"));
});
