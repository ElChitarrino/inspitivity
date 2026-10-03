import { seededRandom, type HarmonicTension, type MelodyMood, type Mode } from '../music-theory/index.js';
import type { ChordRhythm } from '../music-theory/chord-rhythm.js';

export type MusicalDirection = 'mellow' | 'hopeful' | 'driving' | 'tense';
export const MUSICAL_DIRECTIONS: Record<MusicalDirection, {
  label:string; description:string; mode:Mode; mood:MelodyMood; tension:HarmonicTension;
  density:number; rhythm:ChordRhythm; degrees:readonly (readonly number[])[];
}> = {
  mellow:{label:'Mellow',description:'Long phrases, soft attacks and space between notes',mode:'aeolian',mood:'melancholic',tension:'smooth',density:.34,rhythm:'sustain',degrees:[[0,5,2,6],[0,6,5,3],[5,3,0,4]]},
  hopeful:{label:'Hopeful',description:'Rising phrases, open harmony and a clear return',mode:'ionian',mood:'bright',tension:'smooth',density:.53,rhythm:'quarters',degrees:[[0,4,5,3],[3,0,5,4],[0,3,5,4]]},
  driving:{label:'Driving',description:'Short attacks, repeated hooks and a firm pulse',mode:'dorian',mood:'bright',tension:'balanced',density:.73,rhythm:'eighths',degrees:[[0,3,0,6],[0,6,3,4],[0,3,4,0]]},
  tense:{label:'Tense',description:'Pedal tones, close harmonic movement and unresolved turns',mode:'phrygian',mood:'dark',tension:'bold',density:.62,rhythm:'syncopated',degrees:[[0,1,0,6],[0,6,1,0],[0,3,1,0]]},
};
export function chooseDirectionHarmony(direction:MusicalDirection,seed:number,variant=0){
  const profile=MUSICAL_DIRECTIONS[direction];
  const index=(Math.floor(seededRandom(seed)()*profile.degrees.length)+variant)%profile.degrees.length;
  return {name:`${profile.label.toLowerCase()} arc ${index+1}`,degrees:profile.degrees[index]};
}
