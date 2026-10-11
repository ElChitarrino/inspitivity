import test from 'node:test';
import assert from 'node:assert/strict';
import { developSection,varySection,CREATIVE_LAYERS,type SectionLocks } from '../packages/workspace/section-development.js';
import { buildSongPlan } from '../packages/workspace/music.js';
import { validProjects,type Project,type SongSection } from '../packages/workspace/index.js';
import { chordIntervals,notePitchClass } from '../packages/music-theory/index.js';
import { decodeRhythmicChord } from '../packages/music-theory/chord-rhythm.js';

const source:SongSection={id:'verse',name:'Theme',bars:4,color:'mint',energy:'balanced',mix:{bass:{volume:.6,muted:false,solo:false}},ideas:[
 {id:'c',type:'chords',name:'Harmony',detail:'',voice:'warm pad',data:['C|4|48,52,55','Am|4|45,48,52','F|4|41,45,48','G|4|43,47,50']},
 {id:'d',type:'drums',name:'Pocket',detail:'',voice:'dry studio',data:['kick|0|.8|4','snare|4|.75|4','kick|8|.7|4','snare|12|.75|4','hihat|0|.4|4','hihat|2.65|.35|4','hihat|4|.4|4','hihat|6.65|.35|4']},
 {id:'b',type:'bass',name:'Bass',detail:'',voice:'deep bass',data:['36|0|3.8|1','33|4|3.8|1','29|8|3.8|1','31|12|4|1']},
 {id:'m',type:'melody',name:'Hook',detail:'',voice:'glass',data:['E4|0|1|64','G4|1|1|67','C5|2|2|72','C5|4|1|72','E5|6|1|76','A4|8|2|69','G4|12|4|67']},
 {id:'r',type:'riff',name:'Riff',detail:'',voice:'pluck',data:['60|0|.5|1|0','64|2|.5|0|0','69|4|.5|1|0','65|8|.5|1|0','67|12|4|1|0']},
 {id:'alt',type:'melody',name:'Alternate',detail:'keep',data:['C4|0|16|60']},
 {id:'a',type:'audio',name:'Recording',detail:'',recordingId:'rec'},{id:'t',type:'text',name:'Lyrics',detail:'Keep this thought'},
]};
const project:Project={id:'p',name:'Song',bpm:110,meter:'4/4',key:'C ionian',updated:0,sections:[source]};
test('all lock combinations preserve locked tracks, alternate takes, recordings and notes without mutating the source',()=>{
 const snapshot=JSON.stringify(project);
 for(let mask=0;mask<32;mask++){
  const locks:SectionLocks=Object.fromEntries(CREATIVE_LAYERS.map((l,i)=>[l,!!(mask&(1<<i))]));
  const next=varySection(project,source,locks,'energy',391).section;
  for(const layer of CREATIVE_LAYERS)if(locks[layer])assert.deepEqual(next.ideas.find(i=>i.type===layer),source.ideas.find(i=>i.type===layer));
  for(const id of ['alt','a','t'])assert.deepEqual(next.ideas.find(i=>i.id===id),source.ideas.find(i=>i.id===id));
  assert.deepEqual(next.mix,source.mix);assert.equal(next.id,source.id);assert.ok(validProjects([{...project,sections:[next]}]));
 }
 assert.equal(JSON.stringify(project),snapshot);
});
test('locked pitched material anchors the harmonic roots and duration while voicings can change',()=>{
 for(const layer of ['bass','melody','riff'] as const){
  const result=varySection(project,source,{[layer]:true},'energy',112).section;
  const signature=(s:SongSection)=>s.ideas.find(i=>i.type==='chords')!.data!.map(d=>d.split('|').slice(0,2));
  assert.deepEqual(signature(result),signature(source));assert.notDeepEqual(result.ideas[0].data,source.ideas[0].data);
 }
});
test('variations differ by seed and density, preserve the backbeat, and render complete finite song plans',()=>{
 const low=varySection(project,source,{chords:true},'space',19).section;
 const high=varySection(project,source,{chords:true},'energy',19).section;
 const drum=(s:SongSection)=>s.ideas.find(i=>i.type==='drums')!.data!;
 assert.ok(drum(high).length>drum(low).length);
 assert.deepEqual(drum(high).filter(d=>d.startsWith('snare|')).map(d=>d.split('|')[1]),['4','12']);
 const signatures=new Set(Array.from({length:12},(_,seed)=>JSON.stringify(varySection(project,source,{chords:true},'subtle',seed).section.ideas)));
 assert.ok(signatures.size>6);
 const plan=buildSongPlan({...project,sections:[low,high]});
 assert.equal(plan.seconds,32*60/110);assert.ok(plan.events.every(e=>Number.isFinite(e.seconds)&&e.seconds>=0&&e.secondsDuration>0));
});
test('verse and chorus retain the chord sequence and opening motif but produce contrasting rhythm and energy',()=>{
 let id=0;const newId=()=>`new-${id++}`;
 const verse=developSection(project,source,'verse',71,newId),chorus=developSection(project,source,'chorus',71,newId);
 for(const next of [verse,chorus]){
  const chordSignature=(s:SongSection)=>s.ideas.find(i=>i.type==='chords')!.data!.map(d=>d.split('|').slice(0,3));
  assert.deepEqual(chordSignature(next),chordSignature(source));
  assert.deepEqual(next.ideas.find(i=>i.type==='melody')!.data!.filter(d=>Number(d.split('|')[1])<4),source.ideas.find(i=>i.type==='melody')!.data!.filter(d=>Number(d.split('|')[1])<4));
  assert.equal(next.bars,source.bars);assert.notEqual(next.id,source.id);assert.ok(validProjects([{...project,sections:[next]}]));
 }
 assert.equal(verse.energy,'mellow');assert.equal(chorus.energy,'powerful');assert.notDeepEqual(verse.ideas.find(i=>i.type==='drums')!.data,chorus.ideas.find(i=>i.type==='drums')!.data);
 const attacks=(s:SongSection)=>s.ideas.find(i=>i.type==='chords')!.data!.flatMap(d=>decodeRhythmicChord(d).attacks??[]);
 assert.ok(attacks(chorus).length>attacks(verse).length*4);
});
test('bridge keeps a related harmonic vocabulary and refits strong pitched notes to its final harmony',()=>{
 let id=0;const bridge=developSection(project,source,'bridge',19,()=>`bridge-${id++}`);
 const harmony=bridge.ideas.find(i=>i.type==='chords')!.data!.map(decodeRhythmicChord);
 const cycle=harmony.reduce((sum,c)=>sum+c.beats,0);
 for(const idea of bridge.ideas.filter(i=>['bass','melody','riff'].includes(i.type)).slice(0,3))for(const d of idea.data??[]){
  const fields=d.split('|'),beat=Number(fields[1]),pitch=Number(fields[idea.type==='melody'?3:0]);
  if(idea.type!=='bass'&&Math.abs(beat-Math.round(beat))>.08)continue;
  let pos=beat%cycle;const chord=harmony.find(c=>{if(pos<c.beats)return true;pos-=c.beats;return false;})!;
  const root=notePitchClass(chord.name)!;assert.ok(chordIntervals(chord.name).some(i=>(root+i)%12===pitch%12),d);
 }
});
test('mixed and odd meters retain section length and finite playback after development',()=>{
 for(const meter of ['7/8','6/8','5/4']){
  const units=Number(meter.split('/')[0]),s={...source,meterMap:[meter,'4/4',meter,'4/4']};
  const p={...project,meter,sections:[s]},next=varySection(p,s,{chords:true},'energy',44).section;
  assert.deepEqual(next.meterMap,s.meterMap);assert.ok(Math.abs(buildSongPlan({...p,sections:[next]}).seconds-(2*units+8)*60/p.bpm)<1e-9);
 }
});

test('rhythmic variation preserves the explicit phrase boundary and its final rest in playback',()=>{
 const next=varySection(project,source,{chords:true},'energy',9).section;
 const lead=next.ideas.find(i=>i.type==='melody')!;assert.equal(lead.cycleBeats,16);
 const p={...project,sections:[{...next,bars:8}]};
 const notes=buildSongPlan(p).events.filter(e=>e.layer==='melody');
 assert.ok(notes.some(n=>Math.abs(n.start-16)<.001));
 assert.ok(validProjects([JSON.parse(JSON.stringify(p))]));
});
test('a single chord or drum idea develops into a playable four-part section with independent IDs',()=>{
 for(const type of ['chords','drums','melody'] as const){
  const s={...source,ideas:source.ideas.filter(i=>i.type===type).slice(0,1)};
  let id=0;const next=developSection({...project,sections:[s]},s,'chorus',141,()=>`new-${id++}`);
  for(const layer of ['chords','drums','bass','melody'])assert.ok(next.ideas.some(i=>i.type===layer&&i.data?.length),layer);
  const plan=buildSongPlan({...project,sections:[next]});assert.ok(plan.events.length>20);assert.ok(validProjects([{...project,sections:[next]}]));
  assert.equal(new Set(next.ideas.map(i=>i.id)).size,next.ideas.length);
 }
});
