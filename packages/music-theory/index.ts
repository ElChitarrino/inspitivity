export type Root =
  "C" | "Db" | "D" | "Eb" | "E" | "F" | "Gb" | "G" | "Ab" | "A" | "Bb" | "B";
export const SCALE_MODES = ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "harmonic minor", "melodic minor", "major pentatonic", "minor pentatonic", "ionian", "aeolian"] as const;
export type Mode = typeof SCALE_MODES[number];
// Keep legacy values valid in saved projects, but show each scale only once.
export const SELECTABLE_MODES = ["ionian", "aeolian", ...SCALE_MODES.filter(mode=>mode!=="major"&&mode!=="minor"&&mode!=="ionian"&&mode!=="aeolian")] as const;
export const canonicalMode = (mode: string) => mode === "major" ? "ionian" : mode === "minor" ? "aeolian" : mode;
export const MODE_LABELS: Record<Mode, string> = Object.fromEntries(SCALE_MODES.map(mode => [mode, mode === "ionian" ? "Ionian · major" : mode === "aeolian" ? "Aeolian · natural minor" : mode === "melodic minor" ? "Melodic minor · ascending / jazz" : mode])) as Record<Mode, string>;
export type Complexity = "simple" | "medium" | "advanced";
export type MelodyMood = "calm" | "bright" | "melancholic" | "dark";
export type PhraseShape = "flow" | "hook" | "answer" | "floating";
export type ProgressionOpening = "away" | "tonic" | "surprise";
export type HarmonicTension = "smooth" | "balanced" | "bold";

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
  locrian: [0, 1, 3, 5, 6, 8, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  "major pentatonic": [0, 2, 4, 7, 9],
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
  if (/m7b5|ø/.test(normalized)) return [0, 3, 6, 10];
  if (/augMaj7/.test(normalized)) return [0, 4, 8, 11];
  if (/aug7/.test(normalized)) return [0, 4, 8, 10];
  if (/aug|\+/.test(normalized)) return [0, 4, 8];
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
export function generateChordProgression({
  root,
  mode,
  bars,
  complexity,
  seed = Date.now(),
  opening = "away",
  tension = "balanced",
  preferredPitchClasses = [],
  degreePattern,
}: {
  root: Root;
  mode: Mode;
  bars: number;
  complexity: Complexity;
  seed?: number;
  opening?: ProgressionOpening;
  tension?: HarmonicTension;
  preferredPitchClasses?: number[];
  /** Optional phrase grammar; degrees remain relative to the selected mode. */
  degreePattern?: readonly number[];
}) {
  // Pentatonic melodies use the harmony of their parent diatonic scale.
  const harmonicMode = mode === "minor pentatonic" ? "minor" : mode === "major pentatonic" ? "major" : mode;
  const scale = getScale(root, harmonicMode);
  const intervals = MODES[harmonicMode];
  const random = seededRandom(seed);
  const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)];
  const triad = (degree: number) => {
    const size = intervals.length;
    const normalized = ((degree % size) + size) % size;
    const intervalAt = (offset: number) =>
      intervals[(normalized + offset) % size] +
      (normalized + offset >= size ? 12 : 0) -
      intervals[normalized];
    return { degree: normalized, third: intervalAt(2), fifth: intervalAt(4) };
  };
  const isDiminished = (degree: number) => triad(degree).fifth === 6;
  const usable = (degrees: number[]) => {
    const normalized = [...new Set(degrees.map((degree) => degree % scale.length))];
    return tension === "bold" ? normalized : normalized.filter((degree) => !isDiminished(degree));
  };
  const support = new Set(preferredPitchClasses.map((pitch) => ((pitch % 12) + 12) % 12));
  const pickSupported = (degrees: number[]) => {
    const choices = usable(degrees);
    if (!support.size || choices.length < 2) return pick(choices);
    const weighted = choices.flatMap((degree) => {
      const harmony = triad(degree);
      const chordRoot = notePitchClass(scale[harmony.degree]) ?? 0;
      const overlap = [0, harmony.third, harmony.fifth].filter((interval) => support.has((chordRoot + interval) % 12)).length;
      return Array.from({ length: 1 + overlap * 2 }, () => degree);
    });
    return pick(weighted);
  };
  // Weighted harmonic movement: fifths, relative chords and modal steps.
  // Each phrase is composed from its preceding chord, never selected from a list.
  const paths = [[3,4,5,1,2], [4,4,6,3,5], [5,3,1,4], [0,1,4,5,2], [0,0,5,3], [1,3,4,0,2], [0,2,4,1]];
  const openingPool = opening === "away" ? [1,2,3,4,5] : [1,2,3,4,5,6];
  let previous = opening === "tonic" ? 0 : pickSupported(openingPool);
  const used = new Set<number>();
  return Array.from({ length: bars }, (_, index) => {
    let degree = previous;
    if (degreePattern?.length) {
      const intended = ((degreePattern[index % degreePattern.length] % scale.length) + scale.length) % scale.length;
      // Avoid surprising diminished harmony in otherwise settled sketches.
      degree = tension === "bold" || !isDiminished(intended) ? intended
        : [intended - 1, intended + 1, 0].map(candidate => (candidate + scale.length) % scale.length).find(candidate => !isDiminished(candidate)) ?? intended;
    } else if (index > 0) {
      let candidates = paths[previous % paths.length].filter(d => d % scale.length !== previous);
      if (random() < .42) candidates = candidates.concat(Array.from({length:scale.length},(_,degree)=>degree));
      if (index === bars-1 && opening !== "surprise") candidates = candidates.concat([0,4,5]);
      if (used.size < Math.min(3,bars) && index > 1) candidates = candidates.filter(d => !used.has(d % scale.length));
      const available = usable(candidates.length ? candidates : paths[previous % paths.length]);
      degree = pickSupported(available.length ? available : [0,1,2,3,4,5,6]) % scale.length;
    }
    previous = degree; used.add(degree);
    const { third, fifth } = triad(degree);
    const quality = fifth === 6 ? "dim" : fifth === 8 ? "aug" : third === 3 ? "m" : "";
    const relative = (steps: number) => (intervals[(degree+steps)%scale.length] + 12 - intervals[degree]) % 12;
    const seventh = relative(6);
    let suffix = quality;
    if (complexity !== "simple") {
      if (quality === "dim") suffix = seventh === 10 ? "m7b5" : "dim7";
      else if (quality === "aug") suffix = seventh === 11 ? "augMaj7" : "aug7";
      else if (quality === "m" && seventh === 11) suffix = "mMaj7";
      else {
        const prefix = quality === "m" ? "m" : seventh === 11 ? "maj" : "";
        const extensions = ["7"];
        if (relative(1) === 2) {
          extensions.push("9");
          if (quality === "m" && relative(3) === 5) extensions.push("11");
          if (quality !== "m" && relative(5) === 9) extensions.push("13");
        }
        suffix = prefix + (complexity === "advanced" ? pick(extensions) : "7");
      }
    }
    return {
      name: `${scale[degree]}${suffix}`,
      degree,
      roman: romanNumeral(degree, quality),
      pitch: notePitchClass(scale[degree]) ?? 0,
    };
  });
}

function romanNumeral(degree: number, quality: string) {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII"];
  if (quality === "aug") return romans[degree] + "+";
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

export function seededRandom(seed: number) {
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
  const direction = random() < .5 ? -1 : 1;
  const leap = 1 + Math.floor(random()*3);
  const shapeContours: Record<PhraseShape, number[]> = {
    flow: motifA,
    hook: [0, random()<.5 ? 0 : direction, leap*direction, -direction],
    answer: [0, direction, leap*direction, -direction],
    floating: [0, leap*direction, -direction, random()<.5 ? 0 : direction],
  };
  const rhythmShapes: Record<PhraseShape, number[]> = {
    flow: [0.5, 1, 0.5, 1],
    hook: [0.5, 0.25, 0.75, 1.5],
    answer: [0.5, 0.5, 1, 2],
    floating: [1.5, 1, 2, 1.5],
  };
  for (const key of Object.keys(rhythmShapes) as PhraseShape[]) {
    const rotate = Math.floor(random()*4);
    rhythmShapes[key] = rhythmShapes[key].map((_,i)=>rhythmShapes[key][(i+rotate)%4]);
    const split = Math.floor(random()*3);
    if (rhythmShapes[key][split] > .5) { rhythmShapes[key][split] -= .25; rhythmShapes[key][split+1] += .25; }
  }
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
  let start = [0, .25, .5, 1][Math.floor(random()*4)];

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


export type VoicingStyle = "mixed" | "close" | "open" | "drop 2";
export function voiceChord(symbol: string, seed = 1, style: VoicingStyle = "mixed"): number[] {
  const root = notePitchClass(symbol);
  if (root === null) return [];
  const random = seededRandom(seed);
  const selected = style === "mixed" ? (["close","open","drop 2"] as const)[Math.floor(random()*3)] : style;
  let notes = chordIntervals(symbol).slice(0,5).map(interval => 48+root+interval);
  const inversion = Math.floor(random()*Math.min(3,notes.length));
  for (let i=0;i<inversion;i++) { notes[0]+=12; notes.sort((a,b)=>a-b); }
  if (selected === "drop 2" && notes.length >= 3) notes[notes.length-2]-=12;
  if (selected === "open") notes = notes.map((n,i)=>n+(i%2 ? 12 : 0));
  if (random() < .35) notes=notes.map(n=>n-12);
  const bass = notePitchClass(symbol.split("/")[1] ?? symbol) ?? root;
  return [...new Set([36+bass,...notes])].sort((a,b)=>a-b);
}
export function decodeVoicing(symbol: string, encoded?: string): number[] {
  const pitches = encoded?.split(",").map(Number) ?? [];
  if (pitches.length >= 2 && pitches.length <= 8 && pitches.every(n=>Number.isInteger(n) && n>=24 && n<=96)) return pitches;
  const root = notePitchClass(symbol);
  return root === null ? [] : [36+(notePitchClass(symbol.split("/")[1] ?? symbol) ?? root), ...chordIntervals(symbol).slice(0,5).map(i=>48+root+i)];
}
