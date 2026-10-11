import { DRUM_PITCHES, drumPatternBeats, type DrumInstrument } from "../sequencing/index.js";
import { notePitchClass } from "../music-theory/index.js";
import { chordNoteEvents, decodeRhythmicChord } from "../music-theory/chord-rhythm.js";
import type { Project, SongSection, SectionEnergy } from "./index.js";

export function sectionFeel(project: Project, section?: SongSection): { energy: SectionEnergy; reason: string } {
  if (section?.energy)
    return { energy: section.energy, reason: `${section.name} is set to ${section.energy} energy in the arrangement.` };
  const ideas = section ? section.ideas : project.sections.flatMap(s => s.ideas);
  const harmony = ideas.find(i => i.type === "chords");
  const durations = harmony?.data?.map(d => Math.max(0.25, Number(d.split("|")[1]) || 4)) ?? [];
  const melody = ideas.find(i => i.type === "melody")?.data?.map(d => d.split("|").map(Number)) ?? [];
  let score = project.bpm <= 105 ? -0.5 : project.bpm >= 140 ? 0.5 : 0;
  const reasons: string[] = [];
  if (durations.length) {
    const average = durations.reduce((a,b) => a+b, 0) / durations.length;
    score += average >= 4 ? -1.4 : average <= 2 ? 1.1 : 0;
    reasons.push(average >= 4 ? "long, spacious chords" : average <= 2 ? "quick chord changes" : "steady harmonic rhythm");
  }
  if (melody.length) {
    const span = Math.max(1, ...melody.map(n => (n[1] || 0) + (n[2] || 0.5)));
    const density = melody.length / span;
    score += density < 1.25 ? -0.8 : density > 2.2 ? 0.8 : 0;
    reasons.push(density < 1.25 ? "room in the melody" : density > 2.2 ? "an active melody" : "a measured melody");
  }
  return { energy: score <= -1 ? "mellow" : score >= 1 ? "powerful" : "balanced", reason: `Following ${reasons.join(" and ") || `${project.bpm} BPM; add harmony or melody for a closer fit`}${section ? ` in ${section.name}` : ""}.` };
}

export type SongLayer = "drums" | "bass" | "chords" | "melody" | "riff";
export type SongEvent = { sectionId: string; voice?: string; layer: SongLayer; pitch: number; start: number; duration: number; velocity: number; seconds: number; secondsDuration: number };
export type SongMarker = { start: number; seconds: number; meter: string; bpm: number; name?: string };
export function feelVelocity(layer: SongLayer, energy: SectionEnergy = "balanced", velocity = 1) {
  const gains: Record<SectionEnergy,Record<SongLayer,number>> = {
    sparse:{drums:.55,bass:.75,chords:.84,melody:.85,riff:.55},
    mellow:{drums:.72,bass:.84,chords:.9,melody:.88,riff:.7},
    balanced:{drums:1,bass:1,chords:1,melody:1,riff:1},
    driving:{drums:1.09,bass:1.08,chords:.94,melody:1.04,riff:1.12},
    powerful:{drums:1.16,bass:1.1,chords:1,melody:1.08,riff:1.14},
  };
  const gain=gains[energy][layer];
  return Math.max(0,Math.min(1,velocity*gain));
}
export function buildSongPlan(project: Project) {
  const events: SongEvent[] = [], markers: SongMarker[] = [];
  let quarterOffset = 0, secondOffset = 0;
  for (const section of project.sections) {
   const repeats = Math.max(1, Math.min(8, section.repeats ?? 1));
   for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
    const meters = Array.from({ length: section.bars }, (_, i) => section.meterMap?.length ? section.meterMap[i % section.meterMap.length] : project.meter);
    const bars = meters.map(meter => ({ meter, units: Number(meter.split("/")[0]) || 4, ratio: 4 / (Number(meter.split("/")[1]) || 4) }));
    const length = bars.reduce((s,b) => s+b.units, 0);
    const toQuarter = (unit: number) => {
      let rest = Math.min(length, unit), q = 0;
      for (const b of bars) { const take = Math.min(rest, b.units); q += take*b.ratio; rest -= take; if (rest <= 0) break; }
      return q;
    };
    const unitSeconds = 60 / project.bpm;
    let barUnit = 0;
    for (const b of bars) {
      markers.push({ start: quarterOffset + toQuarter(barUnit), seconds: secondOffset + barUnit*unitSeconds, meter: b.meter, bpm: project.bpm*b.ratio, ...(barUnit === 0 ? { name: repeats > 1 ? `${section.name} ${repeatIndex + 1}/${repeats}` : section.name } : {}) });
      barUnit += b.units;
    }
    const add = (layer: SongLayer, pitch: number, start: number, duration: number, velocity: number) => {
      if (![pitch,start,duration,velocity].every(Number.isFinite) || start < 0 || start >= length || duration <= 0) return;
      // Feel shapes the arrangement at playback/export time; saved notes remain intact.
      if((section.energy === "mellow" || section.energy === "sparse") && layer === "drums" && pitch === DRUM_PITCHES.hihat && Math.round(start*4)%8===2)return;
      if(section.energy === "sparse" && layer === "drums" && (pitch === DRUM_PITCHES.openhat || pitch === DRUM_PITCHES.ride || (pitch === DRUM_PITCHES.hihat && Math.round(start*4)%4!==0)))return;
      const end = Math.min(length, start+duration);
      events.push({ sectionId: section.id, voice: section.ideas.find(i => i.type === layer)?.voice, layer, pitch, start: quarterOffset+toQuarter(start), duration: toQuarter(end)-toQuarter(start), velocity:feelVelocity(layer,section.energy,velocity), seconds: secondOffset+start*unitSeconds, secondsDuration: (end-start)*unitSeconds });
    };
    for (const layer of ["chords", "melody", "bass", "riff", "drums"] as const) {
      const idea = section.ideas.find(i => i.type === layer);
      const data = idea?.data ?? (layer === "chords" && idea ? idea.detail.split(" · ") : []);
      if (!data.length) continue;
      if (layer === "chords") {
        const chords = data.map(decodeRhythmicChord);
        const cycle = chords.reduce((sum,chord) => sum+chord.beats,0);
        const notes = chordNoteEvents(chords);
        for (let offset=0;offset<length;offset+=cycle)
          for (const note of notes) add(layer,note.pitch,offset+note.start,note.duration,note.velocity);
      } else if (layer === "drums") {
        const cycle=drumPatternBeats(data,0);
        if(cycle>0) {
          for(let offset=0;offset<length;offset+=cycle) for(const encoded of data) {
            const [instrument,step,velocity]=encoded.split("|");
            add(layer,DRUM_PITCHES[instrument as DrumInstrument],offset+Number(step)/4,.15,Number(velocity)||.7);
          }
          continue;
        }
        let offset = 0;
        for (const bar of bars) {
          for (const encoded of data) {
            const [instrument, step, velocity] = encoded.split("|");
            const pitch = DRUM_PITCHES[instrument as DrumInstrument];
            const start = Number(step)/4;
            // Keep accents on their musical positions; truncate/extend bars, never stretch a 4/4 groove.
            if (start < bar.units) add(layer, pitch, offset+start, 0.15, Number(velocity) || 0.7);
          }
          offset += bar.units;
        }
      } else {
        const notes = data.map(value => {
          const v = value.split("|");
          return layer === "melody" ? { pitch:Number(v[3]), start:Number(v[1]), duration:Number(v[2]), velocity:Number.isFinite(Number(v[4]))&&v[4]!==undefined?Math.max(0,Math.min(1,Number(v[4]))):0.7 } : { pitch:Number(v[0]), start:Number(v[1]), duration:Number(v[2]), velocity:v[4] === "1" ? 0.3 : v[3] === "1" ? 0.8 : 0.55 };
        }).filter(n => [n.pitch,n.start,n.duration].every(Number.isFinite));
        // A saved phrase is its own loop. Repeat it intact until the section
        // ends instead of stretching it to the first bar or dropping it early.
        const phraseEnd = Math.max(.125, idea?.cycleBeats ?? Math.max(...notes.map(n => n.start + n.duration)));
        // Bass phrases repeat on a complete bar, retaining the rest after their
        // last note. Mixed meter sections retain their full written bass line.
        let barEnd = 0;
        const barEnds = bars.map(bar => (barEnd += bar.units));
        const cycle = layer === "bass" && bars.every(bar => bar.meter === bars[0].meter)
          ? barEnds.find(end => end >= phraseEnd - .001) ?? length
          : layer === "bass" ? length : phraseEnd;
        const harmony = layer === "bass" ? section.ideas.find(idea => idea.type === "chords") : undefined;
        const chords = (harmony?.data?.length ? harmony.data : harmony ? harmony.detail.split(" · ") : []).map(decodeRhythmicChord);
        const harmonyCycle = chords.reduce((sum, chord) => sum + chord.beats, 0);
        const rootAt = (beat: number) => {
          if (!harmonyCycle) return null;
          const position = beat % harmonyCycle;
          let start = 0;
          for (const chord of chords) {
            if (position < start + chord.beats) return notePitchClass(chord.name);
            start += chord.beats;
          }
          return null;
        };
        for (let offset = 0; offset < length; offset += cycle) for (const n of notes) {
          let pitch = n.pitch;
          if (layer === "bass" && offset > 0) {
            const sourceRoot = rootAt(n.start), targetRoot = rootAt(offset + n.start);
            if (sourceRoot !== null && targetRoot !== null) {
              pitch += (targetRoot - sourceRoot + 12) % 12;
              while (pitch > 55) pitch -= 12;
              while (pitch < 23) pitch += 12;
            }
          }
          add(layer,pitch,offset+n.start,n.duration,n.velocity);
        }
      }
    }
    quarterOffset += toQuarter(length); secondOffset += length*unitSeconds;
   }
  }
  return { events: events.sort((a,b)=>a.seconds-b.seconds), markers, quarters: quarterOffset, seconds: secondOffset };
}
