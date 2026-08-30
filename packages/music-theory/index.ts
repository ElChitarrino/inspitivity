export type Root = "C" | "Db" | "D" | "Eb" | "E" | "F" | "Gb" | "G" | "Ab" | "A" | "Bb" | "B";
export type Mode = "major" | "minor" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "harmonic minor" | "minor pentatonic";
export type Complexity = "simple" | "medium" | "advanced";
export type MelodyMood = "calm" | "bright" | "melancholic" | "dark";

const PITCH_CLASS: Record<Root, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const DISPLAY_NOTES: Root[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NATURAL_PITCHES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MODES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11], "minor pentatonic": [0, 3, 5, 7, 10],
};

export function getScale(root: Root, mode: Mode) {
  const rootIndex = PITCH_CLASS[root];
  return MODES[mode].map(interval => DISPLAY_NOTES[(rootIndex + interval) % 12]);
}

export function notePitchClass(note: string) {
  const match = note.match(/^([A-G])([#b]{0,2})/);
  if (!match) return null;
  let pitch = NATURAL_PITCHES[match[1]];
  for (const accidental of match[2]) pitch += accidental === "#" ? 1 : -1;
  return (pitch + 12) % 12;
}

export function chordIntervals(symbol: string) {
  const normalized = symbol.replace(/\s/g, "");
  if (/dim7|°7/.test(normalized)) return [0, 3, 6, 9];
  if (/dim|°/.test(normalized)) return [0, 3, 6];
  if (/mMaj9/.test(normalized)) return [0, 3, 7, 11, 14];
  if (/mMaj7/.test(normalized)) return [0, 3, 7, 11];
  if (/maj13/.test(normalized)) return [0, 4, 7, 11, 14, 21];
  if (/maj11/.test(normalized)) return [0, 4, 7, 11, 14, 17];
  if (/maj9/.test(normalized)) return [0, 4, 7, 11, 14];
  if (/maj7/.test(normalized)) return [0, 4, 7, 11];
  if (/m13/.test(normalized)) return [0, 3, 7, 10, 14, 21];
  if (/m11/.test(normalized)) return [0, 3, 7, 10, 14, 17];
  if (/m9/.test(normalized)) return [0, 3, 7, 10, 14];
  if (/m7/.test(normalized)) return [0, 3, 7, 10];
  if (/sus2/.test(normalized)) return [0, 2, 7];
  if (/sus4|sus/.test(normalized)) return [0, 5, 7];
  if (/13/.test(normalized)) return [0, 4, 7, 10, 14, 21];
  if (/11/.test(normalized)) return [0, 4, 7, 10, 14, 17];
  if (/9/.test(normalized)) return [0, 4, 7, 10, 14];
  if (/7/.test(normalized)) return [0, 4, 7, 10];
  if (/m(?!aj)/.test(normalized)) return [0, 3, 7];
  return [0, 4, 7];
}

// A tonic opening is useful sometimes, but a progression is more inviting when
// it can begin with a pre-dominant, dominant, or relative colour as well.
const PATTERNS = [[0, 3, 4, 0], [5, 3, 0, 4], [1, 4, 5, 0], [2, 5, 3, 4], [4, 1, 5, 3], [3, 5, 1, 4]];

export function generateChordProgression({ root, mode, bars, complexity, seed = Date.now() }: { root: Root; mode: Mode; bars: number; complexity: Complexity; seed?: number }) {
  const scale = getScale(root, mode);
  const basePattern = PATTERNS[Math.abs(seed) % PATTERNS.length];
  const minorLike = ["minor", "dorian", "phrygian", "harmonic minor", "minor pentatonic"].includes(mode);
  return Array.from({ length: bars }, (_, index) => {
    const degree = basePattern[index % basePattern.length] % scale.length;
    const third = MODES[mode][(degree + 2) % MODES[mode].length] + ((degree + 2) >= MODES[mode].length ? 12 : 0) - MODES[mode][degree];
    const fifth = MODES[mode][(degree + 4) % MODES[mode].length] + ((degree + 4) >= MODES[mode].length ? 12 : 0) - MODES[mode][degree];
    let quality = fifth === 6 ? "dim" : third === 3 ? "m" : "";
    if (degree === 0 && minorLike) quality = "m";
    const extension = complexity === "simple" ? "" : complexity === "medium" ? (quality === "" ? "maj7" : quality === "m" ? "7" : "7") : (quality === "" ? "maj9" : quality === "m" ? "9" : "7");
    return { name: `${scale[degree]}${quality}${extension}`, degree, roman: romanNumeral(degree, quality), pitch: notePitchClass(scale[degree]) ?? 0 };
  });
}

function romanNumeral(degree: number, quality: string) {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII"];
  return quality ? romans[degree].toLowerCase() + (quality === "dim" ? "°" : "") : romans[degree];
}

const MOOD_PROFILES: Record<MelodyMood, { upward: number; leap: number; repeat: number; syncopation: number }> = {
  calm: { upward: .5, leap: .06, repeat: .26, syncopation: .08 },
  bright: { upward: .68, leap: .22, repeat: .1, syncopation: .3 },
  melancholic: { upward: .34, leap: .1, repeat: .18, syncopation: .16 },
  dark: { upward: .42, leap: .3, repeat: .08, syncopation: .4 },
};

function seededRandom(seed: number) {
  let value = (Math.abs(Math.trunc(seed)) || 1) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function reflect(value: number, max: number) {
  if (max <= 0) return 0;
  let reflected = value;
  while (reflected < 0 || reflected > max) reflected = reflected < 0 ? -reflected : max - (reflected - max);
  return reflected;
}

export function generateMelody({ root, mode, notes = 16, range = [3, 5], density = .6, mood = "calm", seed = Date.now() }: { root: Root; mode: Mode; notes?: number; range?: [number, number]; density?: number; mood?: MelodyMood; seed?: number }) {
  const scale = getScale(root, mode);
  const scalePitchClasses = new Set(scale.map(note => notePitchClass(note)));
  const availablePitches: number[] = [];
  for (let octave = range[0]; octave <= range[1]; octave++) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) if (scalePitchClasses.has(pitchClass)) availablePitches.push(12 * (octave + 1) + pitchClass);
  }
  if (!availablePitches.length || notes <= 0) return [];

  const random = seededRandom(seed);
  const profile = MOOD_PROFILES[mood];
  const rootPitchClass = PITCH_CLASS[root];
  const middle = Math.floor(availablePitches.length / 2);
  const rootIndexes = availablePitches.map((pitch, index) => ({ pitch, index })).filter(item => item.pitch % 12 === rootPitchClass);
  let scaleIndex = rootIndexes.sort((a, b) => Math.abs(a.index - middle) - Math.abs(b.index - middle))[0]?.index ?? middle;

  const nextMovement = () => {
    if (random() < profile.repeat) return 0;
    const direction = random() < profile.upward ? 1 : -1;
    const distance = random() < profile.leap ? 3 + Math.floor(random() * 2) : 1 + (random() < .28 ? 1 : 0);
    return direction * distance;
  };
  const motifA = [0, nextMovement(), nextMovement(), nextMovement()];
  const motifB = [nextMovement(), -motifA[1] || nextMovement(), nextMovement(), -motifA[3] || nextMovement()];
  const result: Array<{ pitch: number; note: string; start: number; duration: number; velocity: number }> = [];
  let start = 0;

  for (let index = 0; index < notes; index++) {
    const phrase = Math.floor(index / 4) % 4;
    const position = index % 4;
    let movement = phrase === 2 ? motifB[position] : motifA[position];
    if (phrase === 1 && position === 2) movement += random() < .5 ? -1 : 1;
    if (phrase === 3 && position === 1) movement += random() < .5 ? -1 : 1;
    scaleIndex = reflect(scaleIndex + movement, availablePitches.length - 1);

    const normalizedDensity = Math.max(0, Math.min(1, density));
    const shortChance = .18 + normalizedDensity * .68;
    let step = random() < shortChance ? .5 : 1;
    if (random() < profile.syncopation * normalizedDensity) step = .25;
    const duration = step * (random() < .18 ? .55 : .9);
    const pitch = availablePitches[scaleIndex];
    const pitchClass = pitch % 12;
    const octave = Math.floor(pitch / 12) - 1;
    const scaleName = scale.find(note => notePitchClass(note) === pitchClass) ?? DISPLAY_NOTES[pitchClass];
    result.push({ pitch, note: `${scaleName}${octave}`, start, duration, velocity: position === 0 ? .92 : .66 + random() * .16 });
    start += step;
  }

  const finalRoot = rootIndexes.sort((a, b) => Math.abs(a.pitch - result[result.length - 1].pitch) - Math.abs(b.pitch - result[result.length - 1].pitch))[0];
  if (finalRoot) {
    const last = result[result.length - 1];
    last.pitch = finalRoot.pitch;
    last.note = `${root}${Math.floor(finalRoot.pitch / 12) - 1}`;
    last.duration = Math.max(last.duration, 1);
  }
  return result;
}
