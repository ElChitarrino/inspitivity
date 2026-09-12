import { decodeVoicing, seededRandom } from "./index.js";

export const CHORD_RHYTHMS = ["adaptive", "sustain", "offbeat", "syncopated", "driving", "sparse"] as const;
export type ChordRhythm = typeof CHORD_RHYTHMS[number];
export type ChordAttack = { start: number; duration: number; velocity: number; up: boolean };
export type RhythmicChord = { name: string; beats: number; pitches?: number[]; attacks?: ChordAttack[] };

export function generateChordRhythm(chords: Pick<RhythmicChord, "beats">[], {
  seed, style = "adaptive", beatsPerBar = 4, kickSteps = [], snareSteps = [],
}: { seed: number; style?: ChordRhythm; beatsPerBar?: number; kickSteps?: number[]; snareSteps?: number[] }): ChordAttack[][] {
  const random = seededRandom(seed);
  const bar = Math.max(1, beatsPerBar);
  let cursor = 0;
  return chords.map((chord, index) => {
    const beats = Math.max(.25, chord.beats);
    if (style === "sustain") { cursor += beats; return [{ start: 0, duration: beats * .9, velocity: .65, up: false }]; }
    const starts: number[] = [];
    const step = style === "driving" ? .5 : .25;
    // Anticipate a new chord, or leave its downbeat empty. Never force beat one.
    const anticipation = index > 0 && ["adaptive", "syncopated"].includes(style) && random() < .38;
    const first = anticipation ? -.25 - (random() < .5 ? .25 : 0) : random() < .6 ? Math.min(.5, beats / 2) : 0;
    starts.push(first);
    for (let at = .5; at < beats - .125; at += step) {
      if (starts.some(s => Math.abs(s - at) < .375)) continue;
      const position = ((cursor + at) % bar + bar) % bar;
      const onKick = kickSteps.some(s => Math.abs((s / 4) % bar - position) < .01);
      const onSnare = snareSteps.some(s => Math.abs((s / 4) % bar - position) < .01);
      const offbeat = at % 1 !== 0;
      const chance = style === "sparse" ? .09 : style === "offbeat" ? (at % 1 === .5 ? .85 : 0)
        : style === "driving" ? .86 : style === "syncopated" ? (offbeat ? .55 : .16)
        : (onKick ? .65 : onSnare ? .08 : offbeat ? .35 : .17);
      if (random() < chance) starts.push(at);
    }
    cursor += beats;
    starts.sort((a,b) => a-b);
    return starts.map((start, hit) => ({ start,
      duration: Math.max(.1, Math.min((starts[hit+1] ?? beats) - start - .06, style === "sparse" ? 1.8 : style === "driving" ? .32 : .35 + random() * .65)),
      velocity: Math.round((.48 + random() * .24 + (start % 1 === 0 ? .08 : 0)) * 100) / 100,
      up: start % 1 !== 0,
    }));
  });
}

export function encodeChordAttacks(attacks?: ChordAttack[]) {
  return attacks?.map(a => `${a.start},${a.duration},${a.velocity},${a.up ? 1 : 0}`).join(";") ?? "";
}
export function decodeChordAttacks(encoded: string | undefined, beats: number): ChordAttack[] | undefined {
  if (!encoded) return undefined; // Existing projects keep their original sustained rhythm.
  const attacks = encoded.split(";").slice(0,128).map(value => {
    const [start,duration,velocity,up] = value.split(",").map(Number);
    return {start,duration,velocity,up:up === 1};
  }).filter(a => [a.start,a.duration,a.velocity].every(Number.isFinite) && a.start >= -.5 && a.start < beats && a.duration > 0 && a.velocity > 0)
    .map(a => ({...a,duration:Math.min(beats-a.start,a.duration),velocity:Math.min(1,a.velocity)}));
  return attacks.length ? attacks.sort((a,b) => a.start-b.start) : undefined;
}
export function decodeRhythmicChord(encoded: string): RhythmicChord {
  const [name, savedBeats, pitches, rhythm] = encoded.split("|");
  const beats = Math.max(.25, Math.min(64,Number(savedBeats) || 4));
  return { name, beats, pitches:decodeVoicing(name,pitches), attacks:decodeChordAttacks(rhythm,beats) };
}

/** A single event path for the tool, section player, arrangement, and MIDI. */
export function chordNoteEvents(chords: RhythmicChord[]) {
  const events: { pitch: number; start: number; duration: number; velocity: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < chords.length; i++) {
    const chord = chords[i], beats = Math.max(.25,chord.beats);
    const attacks = chord.attacks?.length ? chord.attacks : [{start:0,duration:beats*.9,velocity:.65,up:false}];
    const nextAnticipation = Math.min(0,chords[i+1]?.attacks?.[0]?.start ?? 0);
    for (const attack of attacks) {
      const pitches = [...(chord.pitches ?? decodeVoicing(chord.name))].sort((a,b) => attack.up ? b-a : a-b);
      const end = Math.min(cursor+beats+nextAnticipation, cursor+attack.start+attack.duration);
      pitches.forEach((pitch, note) => {
        const start = Math.max(0,cursor+attack.start) + (chord.attacks ? note*.014 : 0);
        if (end > start) events.push({pitch,start,duration:end-start,velocity:attack.velocity});
      });
    }
    cursor += beats;
  }
  return events.sort((a,b) => a.start-b.start);
}
