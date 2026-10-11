import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSICAL_DIRECTIONS,chooseDirectionHarmony,type MusicalDirection } from '../packages/workspace/directions.js';
import { chordIntervals,generateChordProgression,getScale,notePitchClass,type Root } from '../packages/music-theory/index.js';
import { generateChordRhythm } from '../packages/music-theory/chord-rhythm.js';
test('emotional harmony stays diatonic in every key and varies through multiple deliberate arcs',()=>{
 for(const direction of Object.keys(MUSICAL_DIRECTIONS) as MusicalDirection[]){
  const profile=MUSICAL_DIRECTIONS[direction];
  const signatures=new Set(Array.from({length:24},(_,seed)=>chooseDirectionHarmony(direction,seed).degrees.join()));assert.equal(signatures.size,3);
  assert.notDeepEqual(chooseDirectionHarmony(direction,71).degrees,chooseDirectionHarmony(direction,71,1).degrees);
  for(const root of ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'] as Root[])for(let seed=0;seed<8;seed++){
   const scale=new Set(getScale(root,profile.mode).map(notePitchClass));
   const chords=generateChordProgression({root,mode:profile.mode,bars:4,seed,complexity:'medium',tension:profile.tension,degreePattern:chooseDirectionHarmony(direction,seed).degrees});
   assert.ok(chords.every(c=>chordIntervals(c.name).every(interval=>scale.has((c.pitch+interval)%12))),`${direction}/${root}/${seed}`);
  }
 }
});
test('mellow and driving directions yield measurably different attack density, and tense has a different harmonic identity',()=>{
 const chords=Array.from({length:4},()=>({beats:4}));
 const mellow=generateChordRhythm(chords,{seed:71,style:MUSICAL_DIRECTIONS.mellow.rhythm}).flat();
 const driving=generateChordRhythm(chords,{seed:71,style:MUSICAL_DIRECTIONS.driving.rhythm}).flat();
 assert.equal(mellow.length,4);assert.equal(driving.length,32);assert.ok(MUSICAL_DIRECTIONS.mellow.density<MUSICAL_DIRECTIONS.driving.density);
 assert.notEqual(MUSICAL_DIRECTIONS.hopeful.mode,MUSICAL_DIRECTIONS.tense.mode);
 assert.notEqual(MUSICAL_DIRECTIONS.hopeful.mood,MUSICAL_DIRECTIONS.tense.mood);
 assert.notDeepEqual(MUSICAL_DIRECTIONS.hopeful.degrees,MUSICAL_DIRECTIONS.tense.degrees);
});
