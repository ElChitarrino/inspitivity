import assert from "node:assert/strict";
import test from "node:test";
import { mergeProjects, validProjects, type Project } from "../packages/workspace/index.js";
import { sectionFeel, buildSongPlan } from "../packages/workspace/music.js";
import { analyzeArrangement } from "../packages/workspace/arrangement.js";
import { varyIdeaData, varyNotes } from "../packages/workspace/variation.js";
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
  const mixed=project();mixed.sections[0].mix={drums:{muted:false,solo:false,volume:.72}};
  assert.ok(validProjects([mixed]));
  mixed.sections[0].mix.drums!.volume=1.1;
  assert.equal(validProjects([mixed]),false);
  assert.equal(validProjects([{...project(),bpm:0}]),false);
  assert.equal(validProjects([project(),project()]),false);
  assert.equal(validProjects([{...project(),sections:[{...project().sections[0],ideas:[{type:"audio"}]}]}]),false);
});
test("workspace accepts bass, section energy, and bounded repeats",()=>{
  const p=project();
  p.sections[0].energy="powerful"; p.sections[0].repeats=2;
  p.sections[0].ideas.push({id:"b",type:"bass",name:"Bass",detail:"",voice:"deep bass",data:["36|0|0.45|1"]});
  p.sections[0].mix={bass:{muted:false,solo:false,volume:.62}};
  assert.ok(validProjects([p]));
  p.sections[0].repeats=9;
  assert.equal(validProjects([p]),false);
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
  const seven=generateDrumLoop({beatsPerBar:7,seed:0,energy:"powerful",fill:0});
  const accents=seven.filter(h=>h.instrument==="snare"&&h.velocity>.6).map(h=>h.step);
  assert.equal(accents.length,3);
  assert.ok(accents.every(step=>step%4===0 && step<28));
  assert.equal(accents.at(-1),24);
});
test("controlled variations respect locked timing and pitches",()=>{
  const notes=[0,1,2,3].map((start,i)=>({pitch:60+i*2,start,duration:.8}));
  const locked=varyNotes(notes,"energy",{rhythm:true,notes:false},[0,2,4,5,7,9,11],2);
  assert.deepEqual(locked.map(n=>[n.start,n.duration]),notes.map(n=>[n.start,n.duration]));
  assert.notDeepEqual(locked.map(n=>n.pitch),notes.map(n=>n.pitch));
  assert.deepEqual(varyNotes(notes,"space",{rhythm:true,notes:true},[0,2,4],2),notes);
  assert.equal(varyNotes(notes,"space",{rhythm:false,notes:true},[0,2,4],2).length,3);
});
test("section variations audibly transform saved parts instead of cloning them",()=>{
  const melody=["C4|0|0.5|60","D4|0.5|0.5|62","E4|1|0.5|64","G4|1.5|0.5|67","A4|2|0.5|69"];
  const chords=["Cmaj7|4|48,52,55,59","Am7|4|45,48,52,55","Fmaj7|4|41,45,48,52","G7|4|43,47,50,53"];
  const variedMelody=varyIdeaData("melody",melody,9);
  const variedChords=varyIdeaData("chords",chords,9);
  assert.notDeepEqual(variedMelody,melody);
  assert.ok(variedMelody.filter((value,index)=>value!==melody[index]).length>=2);
  assert.notDeepEqual(variedChords,chords);
});
test("arrangement analysis detects missing returns, energy contrast, and foundations",()=>{
  const song=project();
  song.sections=["Intro","Verse","Bridge"].map((name,index)=>({...song.sections[0],id:`s${index}`,name,energy:"balanced",ideas:index===0?song.sections[0].ideas:[]}));
  const check=analyzeArrangement(song);
  assert.equal(check.ready,false);
  assert.deepEqual(check.insights.map(insight=>insight.id),["return","energy","foundation"]);
  assert.equal(check.insights.find(insight=>insight.id==="foundation")?.tool,"drums");
});
test("arrangement analysis clears when form, contrast, and core layers are present",()=>{
  const song=project();
  const ideas=[
    {id:"c",type:"chords" as const,name:"Harmony",detail:"",data:["C|4"]},
    {id:"d",type:"drums" as const,name:"Pocket",detail:"",data:["kick|0|.8"]},
    {id:"b",type:"bass" as const,name:"Bass",detail:"",data:["36|0|.4|1"]},
  ];
  song.sections=["Verse","Chorus","Verse return"].map((name,index)=>({...song.sections[0],id:`s${index}`,name,energy:index===0?"mellow" as const:index===2?"powerful" as const:"balanced" as const,ideas:ideas.map(idea=>({...idea,id:`${idea.id}${index}`}))}));
  assert.deepEqual(analyzeArrangement(song),{ready:true,insights:[]});
});
test("a returned motif counts when the voicing, groove, and bass change",()=>{
  const song=project();
  const make=(index:number)=>[
    {id:`c${index}`,type:"chords" as const,name:"Harmony",detail:"",data:[`Am|4|${index===0?"48,52,55":"60,64,67"}`]},
    {id:`m${index}`,type:"melody" as const,name:"Motif",detail:"",data:["A4|0|1|69","C5|1|1|72"]},
    {id:`d${index}`,type:"drums" as const,name:"Drums",detail:"",data:[`kick|${index}|.7`]},
    {id:`b${index}`,type:"bass" as const,name:"Bass",detail:"",data:[`${36+index}|0|1|1`]},
  ];
  song.sections=["Theme","Contrast","Bloom"].map((name,index)=>({...song.sections[0],id:`s${index}`,name,energy:index===0?"mellow" as const:"powerful" as const,ideas:index===1?[]:make(index)}));
  assert.equal(analyzeArrangement(song).insights.some(insight=>insight.id==="return"),false);
});
test("song plan repeats saved layers, preserves displaced starts, and leaves missing parts silent",()=>{
  const p=project();p.sections[0].ideas.push({id:"m",type:"melody",name:"Flute",detail:"",data:["E4|0.5|0.5|64"]});
  const plan=buildSongPlan(p);
  assert.equal(plan.quarters,8);assert.equal(plan.seconds,4);
  assert.deepEqual(plan.events.filter(e=>e.layer==="melody").map(e=>e.start),[.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5]);
  assert.equal(plan.events.some(e=>e.layer==="drums"),false);
  assert.ok(plan.events.every(e=>e.sectionId==="s"));
  assert.ok(plan.events.every(e=>e.start+e.duration<=8));
});
test("song plan expands arrangement repeats and includes mono bass events",()=>{
  const p=project(); p.sections[0].repeats=2;
  p.sections[0].ideas.push({id:"b",type:"bass",name:"Bass",detail:"",voice:"deep bass",data:["36|0|0.45|1","41|4|0.45|0"]});
  const plan=buildSongPlan(p);
  assert.equal(plan.quarters,16);
  assert.equal(plan.seconds,8);
  assert.deepEqual(plan.events.filter(event=>event.layer==="bass").map(event=>event.start),[0,4,8,12]);
});
test("short saved phrases repeat at their own loop length until a longer section ends",()=>{
  const p=project(); p.sections[0].bars=4;
  p.sections[0].ideas.push({id:"m",type:"melody",name:"Short flute phrase",detail:"",data:["E4|0.5|0.5|64","G4|1.5|0.5|67"]});
  const starts=buildSongPlan(p).events.filter(event=>event.layer==="melody").map(event=>event.start);
  assert.deepEqual(starts,[.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5]);
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


test("saved instrument selections survive serialization and reach every song section", () => {
  const song = project();
  song.sections[0].ideas[0].voice = "distorted guitar";
  song.sections[0].ideas.push({ id:"d", type:"drums", name:"Kit", detail:"", voice:"prog metal", data:["kick|0|0.9"] });
  song.sections.push({ ...song.sections[0], id:"s2", ideas:[{ id:"d2", type:"drums", name:"Rock", detail:"", voice:"rock", data:["snare|4|0.8"] }] });
  const restored = JSON.parse(JSON.stringify(song));
  assert.ok(validProjects([restored]));
  const events = buildSongPlan(restored).events;
  assert.ok(events.filter(e => e.layer === "chords").every(e => e.voice === "distorted guitar"));
  assert.deepEqual([...new Set(events.filter(e => e.layer === "drums").map(e => e.voice))], ["prog metal", "rock"]);
  restored.sections[0].ideas[0].voice = "invalid";
  assert.equal(validProjects([restored]), false);
});

test("acoustic guitar chord sound survives project validation and playback planning",()=>{
  const song=project();
  song.sections[0].ideas[0].voice="acoustic guitar";
  assert.ok(validProjects([JSON.parse(JSON.stringify(song))]));
  assert.ok(buildSongPlan(song).events.filter(event=>event.layer==="chords").every(event=>event.voice==="acoustic guitar"));
});

test("saved chord voicings reach playback and MIDI pitches unchanged",()=>{
  const p=project();
  p.sections[0].ideas[0].data=["Cmaj7|4|36,55,59,64,72"];
  const plan=buildSongPlan(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(plan.events.filter(e=>e.layer==="chords"&&e.start===0).map(e=>e.pitch),[36,55,59,64,72]);
});

test("multi-bar drums retain empty space and repeat at the saved phrase boundary",()=>{
  const p=project();p.sections[0].bars=8;
  p.sections[0].ideas=[{id:"d",type:"drums",name:"Phrase",detail:"",data:["kick|0|1|16","tomlow|44|0.7|16"]}];
  const events=buildSongPlan(p).events;
  assert.deepEqual(events.filter(e=>e.pitch===36).map(e=>e.start),[0,16]);
  assert.deepEqual(events.filter(e=>e.pitch===45).map(e=>e.start),[11,27]);
  p.sections[0].meterMap=["7/8","4/4"];
  assert.ok(buildSongPlan(p).events.every(e=>e.seconds<44*0.5));
});
