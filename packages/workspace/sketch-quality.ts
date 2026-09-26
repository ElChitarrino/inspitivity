import { buildSongPlan } from "./music.js";
import {chordIntervals,notePitchClass} from "../music-theory/index.js";
import {decodeRhythmicChord} from "../music-theory/chord-rhythm.js";
import type { Project } from "./index.js";

/** A fast, deterministic comparison of drafts with the same requested feel. */
export function scoreSketch(project: Project): number {
  const { events } = buildSongPlan(project);
  let score = 0;
  for (const section of project.sections) {
    const notes = events.filter(event => event.sectionId === section.id);
    const chords = notes.filter(event => event.layer === "chords");
    const bass = notes.filter(event => event.layer === "bass");
    const drums = notes.filter(event => event.layer === "drums");
    const leads = notes.filter(event => event.layer === "melody" || event.layer === "riff");
    const bars = Math.max(1, section.bars * (section.repeats ?? 1));
    const harmony=section.ideas.find(idea=>idea.type==="chords")?.data?.map(decodeRhythmicChord)??[];
    const cycle=harmony.reduce((sum,chord)=>sum+chord.beats,0);
    const chordAt=(beat:number)=>{
      if(!cycle)return undefined;
      const position=((beat%cycle)+cycle)%cycle;
      let start=0;
      for(const chord of harmony){if(position<start+chord.beats)return {chord,start,position};start+=chord.beats;}
      return undefined;
    };
    const bassPerBar = bass.length / bars;
    const leadPerBar = leads.length / bars;
    // Musical parts need room to breathe. The target changes with section energy.
    const energy = section.energy === "powerful" ? 1.25 : section.energy === "mellow" ? .7 : 1;
    score -= Math.max(0, bassPerBar - 5 * energy) * .65;
    score -= Math.max(0, leadPerBar - 7 * energy) * .45;
    if (!chords.length || !bass.length || !drums.length) score -= 8;
    // Check the saved harmonic timeline, including gaps between strums.
    for(const encoded of section.ideas.find(idea=>idea.type==="bass")?.data??[]){
      const [pitchValue,beatValue]=encoded.split("|");
      const pitch=Number(pitchValue),at=chordAt(Number(beatValue));
      const root=at&&notePitchClass(at.chord.name);
      if(!Number.isFinite(pitch)||root==null||!at||Math.abs(at.position-at.start)>.15)continue;
      score+=(pitch-root+120)%12===0?.32:(pitch-root+120)%12===7?.08:-.45;
    }
    for(const encoded of section.ideas.find(idea=>idea.type==="melody")?.data??[]){
      const [,beatValue,durationValue,pitchValue]=encoded.split("|");
      const beat=Number(beatValue),pitch=Number(pitchValue),duration=Number(durationValue),at=chordAt(beat);
      const root=at&&notePitchClass(at.chord.name);
      if(!Number.isFinite(pitch)||root==null||!at||!(Math.abs(beat-Math.round(beat))<.08||duration>=.75))continue;
      const tones=new Set(chordIntervals(at.chord.name).map(interval=>(root+interval)%12));
      if(!tones.has(((pitch%12)+12)%12))score-=.28;
    }
    const attacks = leads.filter(note => note.layer === "melody" || note.velocity >= .6);
    const sorted = attacks.slice().sort((a,b) => a.seconds - b.seconds);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i-1], current = sorted[i];
      if (current.layer === previous.layer && current.seconds - previous.seconds < 1.5)
        score -= Math.max(0, Math.abs(current.pitch - previous.pitch) - 12) * .08;
    }
    // Simultaneous riff and melody attacks obscure the hook, especially in quiet sections.
    const melodies = attacks.filter(note => note.layer === "melody");
    const riffs = attacks.filter(note => note.layer === "riff");
    score -= melodies.filter(note => riffs.some(riff => Math.abs(riff.seconds - note.seconds) < .08)).length * .4;
    // A bass note landing with the kick anchors the groove without filling every gap.
    const kicks = drums.filter(note => note.pitch === 36);
    score += Math.min(4, bass.filter(note => kicks.some(kick => Math.abs(kick.seconds - note.seconds) < .08)).length / bars) * .3;
  }
  return score / Math.max(1, project.sections.length);
}

export function chooseSketch<T extends Project>(candidates: T[]): T {
  if (!candidates.length) throw new Error("At least one sketch is required");
  return candidates.reduce((best, candidate) => scoreSketch(candidate) > scoreSketch(best) ? candidate : best);
}
