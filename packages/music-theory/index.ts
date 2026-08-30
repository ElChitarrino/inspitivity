export type Root = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
export type Mode = "major" | "minor" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "harmonic minor" | "minor pentatonic";
export type Complexity = "simple" | "medium" | "advanced";

const NOTES: Root[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MODES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11], "minor pentatonic": [0, 3, 5, 7, 10],
};

export function getScale(root: Root, mode: Mode) {
  const rootIndex = NOTES.indexOf(root);
  return MODES[mode].map((interval) => NOTES[(rootIndex + interval) % 12]);
}

const PATTERNS = [[0, 3, 6, 0], [0, 5, 3, 4], [0, 6, 3, 0], [0, 2, 5, 3], [0, 4, 5, 3]];

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
    return { name: `${scale[degree]}${quality}${extension}`, degree, roman: romanNumeral(degree, quality), pitch: NOTES.indexOf(scale[degree]) };
  });
}

function romanNumeral(degree: number, quality: string) {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII"];
  return quality ? romans[degree].toLowerCase() + (quality === "dim" ? "°" : "") : romans[degree];
}

export function generateMelody({ root, mode, notes = 12, range = [3, 5], density = .6, seed = Date.now() }: { root: Root; mode: Mode; notes?: number; range?: [number, number]; density?: number; seed?: number }) {
  const scale = getScale(root, mode);
  let degree = Math.abs(seed) % scale.length;
  return Array.from({ length: notes }, (_, index) => {
    const movement = ((seed + index * 17) % 5) - 2;
    degree = Math.max(0, Math.min(scale.length - 1, degree + movement));
    const octave = range[0] + Math.floor((degree / Math.max(1, scale.length - 1)) * (range[1] - range[0]));
    const duration = ((seed + index * 7) % 10) / 10 < density ? .5 : 1;
    const pitchClass = NOTES.indexOf(scale[degree]);
    return { pitch: 12 * (octave + 1) + pitchClass, note: `${scale[degree]}${octave}`, start: index * .5, duration, velocity: index % 4 === 0 ? .9 : .7 };
  });
}
