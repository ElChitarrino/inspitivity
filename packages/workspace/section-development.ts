import { chordIntervals, generateChordProgression, generateMelody, getScale, SCALE_MODES, notePitchClass, seededRandom, voiceChord, type Mode, type Root } from '../music-theory/index.js';
import { decodeRhythmicChord, encodeChordAttacks, generateChordRhythm } from '../music-theory/chord-rhythm.js';
import { drumPatternBeats } from '../sequencing/index.js';
import { generateBassPhrase } from './bass.js';
import type { Project, SongSection } from './index.js';
import { buildSketchGroove,chooseSketchGroove,heavyPowerVoicing } from './sketch-grammar.js';
import type { SongLayer } from './music.js';
import { MUSICAL_DIRECTIONS, type MusicalDirection } from './directions.js';
import { varyNotes } from './variation.js';

export const CREATIVE_LAYERS: readonly SongLayer[] = ['chords','drums','bass','melody','riff'];
export type SectionLocks = Partial<Record<SongLayer,boolean>>;
export type SectionChange = 'subtle' | 'space' | 'energy';
export type SectionRole = 'verse' | 'chorus' | 'bridge' | 'return';
const pc=(n:number)=>((n%12)+12)%12;
const name=(pitch:number)=>`${['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][pc(pitch)]}${Math.floor(pitch/12)-1}`;
const harmony=(p:Project)=>{const [candidate,...rest]=p.key.split(' '),candidateMode=rest.join(' ').toLowerCase();return {root:(notePitchClass(candidate)!==null?candidate:'C') as Root,mode:(SCALE_MODES.includes(candidateMode as Mode)?candidateMode:'ionian') as Mode};};
const bars=(p:Project,s:SongSection)=>Array.from({length:s.bars},(_,i)=>Number((s.meterMap?.[i%s.meterMap.length]??p.meter).split('/')[0])||4);
const atChord=(data:string[],beat:number)=>{
  const chords=data.map(decodeRhythmicChord),cycle=chords.reduce((sum,c)=>sum+c.beats,0);
  let at=cycle?beat%cycle:0;
  return chords.find(c=>{if(at<c.beats)return true;at-=c.beats;return false;});
};
function fitPitch(pitch:number,beat:number,data:string[],force=false){
  const chord=atChord(data,beat),root=chord&&notePitchClass(chord.name);
  if(root==null||!chord||(!force&&Math.abs(beat-Math.round(beat))>.08))return pitch;
  const tones=chordIntervals(chord.name).map(i=>(root+i)%12);
  return Array.from({length:25},(_,i)=>pitch+i-12).filter(n=>tones.includes(pc(n))).sort((a,b)=>Math.abs(a-pitch)-Math.abs(b-pitch))[0]??pitch;
}

/** One operation changes active takes only. Locked tracks, recordings, notes and alternate takes stay byte-for-byte intact. */
export function varySection(project:Project,source:SongSection,locks:SectionLocks,change:SectionChange,seed:number,direction?:MusicalDirection): { section:SongSection; summary:string[] } {
  const {root,mode}=harmony(project),random=seededRandom(seed),barLengths=bars(project,source);
  const length=barLengths.reduce((a,b)=>a+b,0),scale=getScale(root,mode).map(notePitchClass).filter((n):n is number=>n!==null);
  const active=new Map(CREATIVE_LAYERS.map(layer=>[layer,source.ideas.find(i=>i.type===layer)]));
  const chordIdea=active.get('chords');
  const oldHarmony=chordIdea?.data?.length?chordIdea.data:chordIdea?.detail?chordIdea.detail.split(' · '):[];
  const profile=direction?MUSICAL_DIRECTIONS[direction]:undefined;
  const summaries:string[]=[];
  // Locked pitched parts are anchors: change voicing and attacks, retain their chord roots and harmonic timing.
  const anchored=['bass','melody','riff'].some(layer=>locks[layer as SongLayer]&&active.get(layer as SongLayer)?.data?.length);
  let newHarmony=oldHarmony;
  if(!locks.chords&&oldHarmony.length){
    const before=oldHarmony.map(decodeRhythmicChord);
    const symbols=anchored||change==='subtle'?before.map(c=>c.name):generateChordProgression({root,mode,bars:before.length,complexity:source.ideas.find(i=>i.type==='chords')?.voice==='distorted guitar'?'simple':'medium',seed,tension:profile?.tension??'smooth',degreePattern:profile?.degrees[Math.floor(random()*profile.degrees.length)]}).map(c=>c.name);
    const distorted=active.get('chords')?.voice==='distorted guitar';
    const next=before.map((c,i)=>({...c,name:symbols[i],pitches:distorted?heavyPowerVoicing(symbols[i]):voiceChord(symbols[i],seed+i*17,change==='space'?'open':'mixed')}));
    const attacks=generateChordRhythm(next,{seed,style:change==='space'?'sustain':change==='energy'?'eighths':profile?.rhythm??'adaptive'});
    newHarmony=next.map((c,i)=>`${c.name}|${c.beats}|${c.pitches.join(',')}|${encodeChordAttacks(attacks[i])}`);
    summaries.push(anchored?'Harmony anchors retained; new voicings and attacks':'Harmony and chord rhythm varied');
  }
  let drumData=active.get('drums')?.data??[];
  if(!locks.drums&&drumData.length){
    const cycle=drumPatternBeats(drumData,barLengths[0]);
    const hits=drumData.map(d=>{const [instrument,step,velocity]=d.split('|');return {instrument,step:Number(step),velocity:Number(velocity)||.7};});
    const retained=hits.filter((h,i)=>change!=='space'||!['hihat','openhat','ride'].includes(h.instrument)||Math.round(h.step)%4===0||i%3===0);
    if(change==='energy')for(let beat=0;beat<cycle;beat+=.5){const step=beat*4;if(!retained.some(h=>h.instrument==='hihat'&&Math.abs(h.step-step)<1))retained.push({instrument:'hihat',step,velocity:beat%1===0?.57:.34});}
    if(change==='subtle'){
      // A small kick pickup, never displace the existing backbeat.
      const slot=Math.max(0,Math.floor(random()*Math.max(1,cycle-1))*4+3);
      if(!retained.some(h=>h.instrument==='kick'&&h.step===slot))retained.push({instrument:'kick',step:slot,velocity:.58});
    }
    drumData=retained.sort((a,b)=>a.step-b.step).map((h,i)=>`${h.instrument}|${h.step}|${Math.max(.18,Math.min(.95,h.velocity*(change==='space'?.78:change==='energy'?1.12:.94+((i+seed)%3)*.06))).toFixed(3)}|${cycle}`);
    summaries.push(change==='space'?'Fewer cymbal notes; softer backbeat':change==='energy'?'Denser hats; stronger accents':'Backbeat kept; kick pickup and accents varied');
  }
  let section={...source,ideas:source.ideas.map(idea=>idea===active.get('chords')&&!locks.chords?{...idea,data:newHarmony,detail:newHarmony.map(d=>d.split('|')[0]).join(' · ')}:idea===active.get('drums')&&!locks.drums?{...idea,data:drumData,detail:`${drumData.length} hits`}:idea)};
  section={...section,ideas:section.ideas.map(idea=>{
    if(!CREATIVE_LAYERS.includes(idea.type as SongLayer)||idea!==active.get(idea.type as SongLayer)||locks[idea.type as SongLayer]||!idea.data?.length||!['bass','melody','riff'].includes(idea.type))return idea;
    if(idea.type==='bass'){
      const generated=generateBassPhrase({root,mode,length,meter:project.meter,meterMap:source.meterMap,harmony:newHarmony.map(d=>{const c=decodeRhythmicChord(d);return {symbol:c.name,beats:c.beats};}),direction:change==='space'?'sustained':change==='energy'?'eighth notes':'groove',movement:'supportive',lockToKick:true,kickStarts:drumData.filter(d=>d.startsWith('kick|')).map(d=>Number(d.split('|')[1])/4),kickCycle:drumPatternBeats(drumData,barLengths[0]),density:change==='space'?.3:change==='energy'?.8:.55,repeatRhythm:true,seed:seed+29});
      summaries.push(change==='space'?'Longer bass notes; space for the lead':'Bass follows the harmony and kick');
      return {...idea,data:generated.map(n=>`${n.pitch}|${n.start}|${n.duration}|${n.accent?1:0}`),detail:`${generated.length} notes · follows harmony and kick`};
    }
    const notes=idea.data.map(d=>{const f=d.split('|');return {fields:f,pitch:Number(f[idea.type==='melody'?3:0]),start:Number(f[1]),duration:Number(f[2])};});
    const varied=varyNotes(notes,change,{notes:false,rhythm:false},scale,seed+43).filter(n=>n.start<length);
    const data=varied.map(n=>{const f=[...n.fields],pitch=fitPitch(n.pitch,n.start,newHarmony);f[idea.type==='melody'?3:0]=String(pitch);if(idea.type==='melody')f[0]=name(pitch);f[1]=String(n.start);f[2]=String(Math.max(.125,Math.min(n.duration,length-n.start)));return f.join('|');});
    summaries.push(idea.type==='melody'?'Lead motif varied; strong notes follow the chords':'Riff varied around the same musical pulse');
    return {...idea,data,cycleBeats:idea.cycleBeats??Math.max(.125,...notes.map(n=>n.start+n.duration)),detail:`${data.length} notes`};
  })};
  return {section,summary:summaries.length?summaries:['All available parts are locked']};
}

function completeFoundation(project:Project,source:SongSection,seed:number,newId:()=>string):SongSection {
  const {root,mode}=harmony(project),barLengths=bars(project,source),length=barLengths.reduce((a,b)=>a+b,0);
  const ideas=[...source.ideas];
  const heavy=ideas.some(i=>i.voice==='distorted guitar'),soul=ideas.some(i=>i.voice==='warm pad');
  if(!ideas.some(i=>i.type==='chords'&&(i.data?.length||i.detail))){
    const chords=generateChordProgression({root,mode,bars:4,complexity:heavy?'simple':'medium',seed,tension:'smooth',opening:'tonic'});
    ideas.unshift({id:newId(),type:'chords',name:'Related harmony',detail:chords.map(c=>c.name).join(' · '),voice:heavy?'distorted guitar':'warm pad',data:chords.map((c,i)=>`${c.name}|${barLengths[i%barLengths.length]}|${(heavy?heavyPowerVoicing(c.name):voiceChord(c.name,seed+i,'open')).join(',')}`)});
  }
  const chords=ideas.find(i=>i.type==='chords')!;
  const chordData=chords.data?.length?chords.data:chords.detail.split(' · ');
  if(!ideas.some(i=>i.type==='drums'&&i.data?.length)){
    const groove=chooseSketchGroove(heavy?'heavy':soul?'neo-soul':'rock',barLengths[0],seed);
    const hits=buildSketchGroove(groove,barLengths[0],1,seed,'balanced','theme');
    ideas.push({id:newId(),type:'drums',name:groove.name,detail:'Related groove',voice:heavy?'prog metal':soul?'dry studio':'roomy rock',data:hits.map(h=>`${h.instrument}|${h.step}|${h.velocity}|${barLengths[0]}`)});
  }
  const drumData=ideas.find(i=>i.type==='drums')!.data!;
  if(!ideas.some(i=>i.type==='bass'&&i.data?.length)){
    const bass=generateBassPhrase({root,mode,length,meter:project.meter,meterMap:source.meterMap,harmony:chordData.map(d=>{const c=decodeRhythmicChord(d);return {symbol:c.name,beats:c.beats};}),direction:'groove',movement:'supportive',lockToKick:true,kickStarts:drumData.filter(d=>d.startsWith('kick|')).map(d=>Number(d.split('|')[1])/4),kickCycle:drumPatternBeats(drumData,barLengths[0]),seed,density:.5,repeatRhythm:true});
    ideas.push({id:newId(),type:'bass',name:'Related bass',voice:'deep bass',detail:'Follows harmony and kick',data:bass.map(n=>`${n.pitch}|${n.start}|${n.duration}|${n.accent?1:0}`)});
  }
  if(!ideas.some(i=>['melody','riff'].includes(i.type)&&i.data?.length)){
    const melody=generateMelody({root,mode,notes:12,seed,density:.45,mood:'calm',shape:'hook'});
    const end=Math.max(.25,...melody.map(n=>n.start+n.duration)),ratio=Math.min(length,barLengths[0]*4)/end;
    ideas.push({id:newId(),type:'melody',name:'Related motif',voice:'air flute',cycleBeats:Math.min(length,barLengths[0]*4),detail:'Related motif',data:melody.map(n=>{const start=Math.round(n.start*ratio*4)/4,pitch=fitPitch(n.pitch,start,chordData);return `${name(pitch)}|${start}|${Math.max(.125,n.duration*ratio)}|${pitch}`;})});
  }
  return {...source,ideas};
}

/** Develop material rather than replace it. Verse/chorus retain chord order and the opening melodic cell. */
export function developSection(project:Project,source:SongSection,role:SectionRole,seed:number,newId:()=>string):SongSection{
  const foundation=completeFoundation(project,source,seed,newId);
  const locks:SectionLocks={chords:role!=='bridge'};
  const result=varySection(project,foundation,locks,role==='verse'?'space':role==='chorus'?'energy':'subtle',seed).section;
  const sourceLead=source.ideas.find(i=>i.type==='melody');
  const ideas=result.ideas.map(idea=>{
    let data=idea.data;
    if(idea.type==='melody'&&data?.length&&sourceLead?.data?.length&&role!=='bridge'){
      const opening=sourceLead.data.filter(d=>Number(d.split('|')[1])<(bars(project,source)[0]??4));
      data=[...opening,...data.filter(d=>Number(d.split('|')[1])>=(bars(project,source)[0]??4))];
    }
    if(role==='bridge'&&idea.type==='chords'&&data&&data.length>2){
      // Rotate the established cycle to expose its relative colour; keep a recognisable harmonic vocabulary.
      data=[...data.slice(2),...data.slice(0,2)];
    }
    return {...idea,id:newId(),data:data?[...data]:undefined};
  });
  let next={...result,id:newId(),name:role==='return'?`${source.name} return`:role[0].toUpperCase()+role.slice(1),repeats:1,energy:role==='verse'?'mellow' as const:role==='chorus'?'powerful' as const:'balanced' as const,ideas};
  // Bridge rotation happens after generation; refit every unlocked pitched attack to the final harmony.
  const finalHarmony=next.ideas.find(i=>i.type==='chords')?.data??[];
  if(role==='bridge')next={...next,ideas:next.ideas.map(i=>!['bass','melody','riff'].includes(i.type)||!i.data?i:{...i,data:i.data.map(d=>{const f=d.split('|'),pi=i.type==='melody'?3:0,p=fitPitch(Number(f[pi]),Number(f[1]),finalHarmony,i.type==='bass');f[pi]=String(p);if(i.type==='melody')f[0]=name(p);return f.join('|');})})};
  return next;
}
