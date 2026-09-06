export type Root =
  "C" | "Db" | "D" | "Eb" | "E" | "F" | "Gb" | "G" | "Ab" | "A" | "Bb" | "B";
export type Mode =
  | "major"
  | "minor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "harmonic minor"
  | "minor pentatonic";
export type Complexity = "simple" | "medium" | "advanced";
export type MelodyMood = "calm" | "bright" | "melancholic" | "dark";
export type PhraseShape = "flow" | "hook" | "answer" | "floating";
export type ProgressionOpening = "away" | "tonic" | "surprise";

const PITCH_CLASS: Record<Root, number> = {
  C: 0,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  Gb: 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
};
const DISPLAY_NOTES: Root[] = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const NATURAL_PITCHES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const MODES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "minor pentatonic": [0, 3, 5, 7, 10],
};

export function getScale(root: Root, mode: Mode) {
  const rootIndex = PITCH_CLASS[root];
  return MODES[mode].map(
    (interval) => DISPLAY_NOTES[(rootIndex + interval) % 12],
  );
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
  if (/4th|quartal/.test(normalized)) return [0, 5, 10];
  if (/sus2/.test(normalized)) return [0, 2, 7];
  if (/sus4|sus/.test(normalized)) return [0, 5, 7];
  if (/13/.test(normalized)) return [0, 4, 7, 10, 14, 21];
  if (/11/.test(normalized)) return [0, 4, 7, 10, 14, 17];
  if (/9/.test(normalized)) return [0, 4, 7, 10, 14];
  if (/7/.test(normalized)) return [0, 4, 7, 10];
  if (/m(?!aj)/.test(normalized)) return [0, 3, 7];
  return [0, 4, 7];
}

// Phrase-shaped templates give regeneration a dependable harmonic arc. Most
// begin away from tonic, but they still prepare or imply a convincing return.
const PROGRESSION_PATTERNS: Record<ProgressionOpening, number[][]> = {
  away: [
    [5, 3, 0, 4],
    [1, 4, 5, 3],
    [3, 5, 1, 4],
    [2, 5, 3, 4],
    [5, 1, 3, 4],
  ],
  tonic: [
    [0, 3, 4, 0],
    [0, 5, 1, 4],
    [0, 2, 3, 4],
  ],
  surprise: [
    [2, 5, 3, 1],
    [4, 1, 5, 3],
    [6, 3, 1, 4],
    [1, 5, 2, 4],
  ],
};

export function generateChordProgression({
  root,
  mode,
  bars,
  complexity,
  seed = Date.now(),
  opening = "away",
}: {
  root: Root;
  mode: Mode;
  bars: number;
  complexity: Complexity;
  seed?: number;
  opening?: ProgressionOpening;
}) {
  const scale = getScale(root, mode);
  const patterns = PROGRESSION_PATTERNS[opening];
  const basePattern = patterns[Math.abs(seed) % patterns.length];
  const minorLike = [
    "minor",
    "dorian",
    "phrygian",
    "harmonic minor",
    "minor pentatonic",
  ].includes(mode);
  return Array.from({ length: bars }, (_, index) => {
    const degree = basePattern[index % basePattern.length] % scale.length;
    const third =
      MODES[mode][(degree + 2) % MODES[mode].length] +
      (degree + 2 >= MODES[mode].length ? 12 : 0) -
      MODES[mode][degree];
    const fifth =
      MODES[mode][(degree + 4) % MODES[mode].length] +
      (degree + 4 >= MODES[mode].length ? 12 : 0) -
      MODES[mode][degree];
    let quality = fifth === 6 ? "dim" : third === 3 ? "m" : "";
    if (degree === 0 && minorLike) quality = "m";
    const extension =
      complexity === "simple"
        ? ""
        : complexity === "medium"
          ? quality === ""
            ? "maj7"
            : quality === "m"
              ? "7"
              : "7"
          : quality === ""
            ? "maj9"
            : quality === "m"
              ? "9"
              : "7";
    return {
      name: `${scale[degree]}${quality}${extension}`,
      degree,
      roman: romanNumeral(degree, quality),
      pitch: notePitchClass(scale[degree]) ?? 0,
    };
  });
}

function romanNumeral(degree: number, quality: string) {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII"];
  return quality
    ? romans[degree].toLowerCase() + (quality === "dim" ? "°" : "")
    : romans[degree];
}

const MOOD_PROFILES: Record<
  MelodyMood,
  { upward: number; leap: number; repeat: number; syncopation: number }
> = {
  calm: { upward: 0.5, leap: 0.06, repeat: 0.26, syncopation: 0.08 },
  bright: { upward: 0.68, leap: 0.22, repeat: 0.1, syncopation: 0.3 },
  melancholic: { upward: 0.34, leap: 0.1, repeat: 0.18, syncopation: 0.16 },
  dark: { upward: 0.42, leap: 0.3, repeat: 0.08, syncopation: 0.4 },
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
  while (reflected < 0 || reflected > max)
    reflected = reflected < 0 ? -reflected : max - (reflected - max);
  return reflected;
}

export function generateMelody({
  root,
  mode,
  notes = 16,
  range = [3, 5],
  density = 0.6,
  mood = "calm",
  shape = "flow",
  seed = Date.now(),
}: {
  root: Root;
  mode: Mode;
  notes?: number;
  range?: [number, number];
  density?: number;
  mood?: MelodyMood;
  shape?: PhraseShape;
  seed?: number;
}) {
  const scale = getScale(root, mode);
  const scalePitchClasses = new Set(scale.map((note) => notePitchClass(note)));
  const availablePitches: number[] = [];
  for (let octave = range[0]; octave <= range[1]; octave++) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++)
      if (scalePitchClasses.has(pitchClass))
        availablePitches.push(12 * (octave + 1) + pitchClass);
  }
  if (!availablePitches.length || notes <= 0) return [];

  const random = seededRandom(seed);
  const profile = MOOD_PROFILES[mood];
  const rootPitchClass = PITCH_CLASS[root];
  const middle = Math.floor(availablePitches.length / 2);
  const rootIndexes = availablePitches
    .map((pitch, index) => ({ pitch, index }))
    .filter((item) => item.pitch % 12 === rootPitchClass);
  const tonalStarts = availablePitches
    .map((pitch, index) => ({ pitch, index }))
    .filter((item) => {
      const interval = (item.pitch - rootPitchClass + 120) % 12;
      return interval === MODES[mode][2] || interval === MODES[mode][4];
    })
    .sort((a, b) => Math.abs(a.index - middle) - Math.abs(b.index - middle));
  let scaleIndex = tonalStarts[Math.floor(random() * Math.min(3, tonalStarts.length))]?.index ?? middle;
  const anchorIndex = scaleIndex;

  const nextMovement = () => {
    if (random() < profile.repeat) return 0;
    const direction = random() < profile.upward ? 1 : -1;
    const distance =
      random() < profile.leap
        ? 3 + Math.floor(random() * 2)
        : 1 + (random() < 0.28 ? 1 : 0);
    return direction * distance;
  };
  const motifA = [0, nextMovement(), nextMovement(), nextMovement()];
  const shapeContours: Record<PhraseShape, number[]> = {
    flow: motifA,
    hook: [0, 0, seed % 2 ? 2 : -2, -1],
    answer: [0, 1, 2, -1],
    floating: [0, 2, -1, 1],
  };
  const rhythmShapes: Record<PhraseShape, number[]> = {
    flow: [0.5, 1, 0.5, 1],
    hook: [0.5, 0.25, 0.75, 1.5],
    answer: [0.5, 0.5, 1, 2],
    floating: [1.5, 1, 2, 1.5],
  };
  const motifB = [
    nextMovement(),
    -motifA[1] || nextMovement(),
    nextMovement(),
    -motifA[3] || nextMovement(),
  ];
  const result: Array<{
    pitch: number;
    note: string;
    start: number;
    duration: number;
    velocity: number;
  }> = [];
  // A short pickup makes the phrase feel played rather than dropped on beat 1.
  let start = profile.syncopation >= 0.3 ? 0.25 : 0.5;

  for (let index = 0; index < notes; index++) {
    const phrase = Math.floor(index / 4) % 4;
    const position = index % 4;
    if (shape !== "flow" && position === 0)
      scaleIndex = reflect(anchorIndex + (shape === "answer" && phrase % 2 ? -2 : 0), availablePitches.length - 1);
    let movement = shape === "flow"
      ? phrase === 2 ? motifB[position] : motifA[position]
      : shapeContours[shape][position] * (shape === "answer" && phrase % 2 ? -1 : 1);
    // Repeat first; vary only one structural note in every second phrase.
    if (phrase === 1 && position === 3) movement += seed % 2 ? -1 : 1;
    if (phrase === 3 && position === 2) movement += seed % 3 ? -1 : 1;
    scaleIndex = reflect(scaleIndex + movement, availablePitches.length - 1);

    const normalizedDensity = Math.max(0, Math.min(1, density));
    const shortChance = 0.18 + normalizedDensity * 0.68;
    let step = random() < shortChance ? 0.5 : 1;
    if (random() < profile.syncopation * normalizedDensity) step = 0.25;
    if (shape !== "flow")
      step = rhythmShapes[shape][position] * (normalizedDensity > 0.75 ? 0.5 : 1);
    const duration = step * (random() < 0.18 ? 0.55 : 0.9);
    const pitch = availablePitches[scaleIndex];
    const pitchClass = pitch % 12;
    const octave = Math.floor(pitch / 12) - 1;
    const scaleName =
      scale.find((note) => notePitchClass(note) === pitchClass) ??
      DISPLAY_NOTES[pitchClass];
    result.push({
      pitch,
      note: `${scaleName}${octave}`,
      start,
      duration,
      velocity: position === 0 ? 0.92 : 0.66 + random() * 0.16,
    });
    start += step;
  }

  const finalRoot = rootIndexes.sort(
    (a, b) =>
      Math.abs(a.pitch - result[result.length - 1].pitch) -
      Math.abs(b.pitch - result[result.length - 1].pitch),
  )[0];
  if (finalRoot) {
    const last = result[result.length - 1];
    last.pitch = finalRoot.pitch;
    last.note = `${root}${Math.floor(finalRoot.pitch / 12) - 1}`;
    last.duration = Math.max(last.duration, 1);
  }
  return result;
}
