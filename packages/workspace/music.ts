import { chordIntervals, notePitchClass } from "../music-theory/index.js";
import type { Project, SongSection } from "./index.js";
import type { GrooveEnergy } from "../sequencing/index.js";

export function sectionFeel(project: Project, section?: SongSection): { energy: GrooveEnergy; reason: string } {
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

export type SongLayer = "drums" | "chords" | "melody" | "riff";
export type SongEvent = { layer: SongLayer; pitch: number; start: number; duration: number; velocity: number; seconds: number; secondsDuration: number };
export type SongMarker = { start: number; seconds: number; meter: string; bpm: number; name?: string };
export function buildSongPlan(project: Project) {
  const events: SongEvent[] = [], markers: SongMarker[] = [];
  let quarterOffset = 0, secondOffset = 0;
  for (const section of project.sections) {
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
      markers.push({ start: quarterOffset + toQuarter(barUnit), seconds: secondOffset + barUnit*unitSeconds, meter: b.meter, bpm: project.bpm*b.ratio, ...(barUnit === 0 ? { name: section.name } : {}) });
      barUnit += b.units;
    }
    const add = (layer: SongLayer, pitch: number, start: number, duration: number, velocity: number) => {
      if (![pitch,start,duration,velocity].every(Number.isFinite) || start < 0 || start >= length || duration <= 0) return;
      const end = Math.min(length, start+duration);
      events.push({ layer, pitch, start: quarterOffset+toQuarter(start), duration: toQuarter(end)-toQuarter(start), velocity, seconds: secondOffset+start*unitSeconds, secondsDuration: (end-start)*unitSeconds });
    };
    for (const layer of ["chords", "melody", "riff", "drums"] as const) {
      const idea = section.ideas.find(i => i.type === layer);
      const data = idea?.data ?? (layer === "chords" && idea ? idea.detail.split(" · ") : []);
      if (!data.length) continue;
      if (layer === "chords") {
        let cursor = 0, i = 0;
        while (cursor < length) {
          const [symbol, beat] = data[i++ % data.length].split("|");
          const duration = Math.max(0.25, Number(beat) || 4), root = notePitchClass(symbol);
          if (root !== null) {
            for (const interval of chordIntervals(symbol).slice(0,5)) add(layer, 48+root+interval, cursor, duration*0.9, 0.65);
            add(layer, 36+root, cursor, duration*0.8, 0.5);
          }
          cursor += duration;
        }
      } else if (layer === "drums") {
        let offset = 0;
        for (const bar of bars) {
          for (const encoded of data) {
            const [instrument, step, velocity] = encoded.split("|");
            const pitch = ({ kick:36, snare:38, hihat:42, crash:49, ride:51 } as Record<string,number>)[instrument];
            const start = Number(step)/4;
            // Keep accents on their musical positions; truncate/extend bars, never stretch a 4/4 groove.
            if (start < bar.units) add(layer, pitch, offset+start, 0.15, Number(velocity) || 0.7);
          }
          offset += bar.units;
        }
      } else {
        const notes = data.map(value => {
          const v = value.split("|");
          return layer === "melody" ? { pitch:Number(v[3]), start:Number(v[1]), duration:Number(v[2]), velocity:0.7 } : { pitch:Number(v[0]), start:Number(v[1]), duration:Number(v[2]), velocity:v[4] === "1" ? 0.3 : v[3] === "1" ? 0.8 : 0.55 };
        }).filter(n => [n.pitch,n.start,n.duration].every(Number.isFinite));
        const cycle = Math.max(bars[0]?.units ?? 4, Math.ceil(Math.max(0,...notes.map(n=>n.start+n.duration))/(bars[0]?.units ?? 4))*(bars[0]?.units ?? 4));
        for (let offset = 0; offset < length; offset += cycle) for (const n of notes) add(layer,n.pitch,offset+n.start,n.duration,n.velocity);
      }
    }
    quarterOffset += toQuarter(length); secondOffset += length*unitSeconds;
  }
  return { events: events.sort((a,b)=>a.seconds-b.seconds), markers, quarters: quarterOffset, seconds: secondOffset };
}
