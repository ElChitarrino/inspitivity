import { getScale, notePitchClass, type Mode } from "../music-theory/index.js";
import type { MusicalDirection } from "./directions.js";

export type SketchStyle = "emotive" | "rock" | "neo-soul" | "funk" | "prog" | "heavy";
export type SketchGroove = {
  name: string;
  /** Four grid steps per saved meter beat; compound meters count eighth notes. */
  sourceSteps: number;
  kick: number[];
  snare: number[];
  hats: number[];
  ghost?: number[];
  swing?: number;
  pickup?: number;
  shuffle?: boolean;
};
export type SketchHarmony = {
  name: string;
  degrees: readonly number[];
  moods: readonly MusicalDirection[];
};

const harmony = (name: string, degrees: number[], ...moods: MusicalDirection[]): SketchHarmony => ({
  name,
  degrees,
  moods,
});
const brightAcoustic = [
  harmony("singer-songwriter lift", [0, 4, 5, 3], "hopeful"),
  harmony("relative-minor return", [5, 3, 0, 4], "mellow"),
  harmony("doo-wop turnaround", [0, 5, 3, 4], "hopeful"),
  harmony("hopscotch lift", [3, 4, 5, 0], "hopeful", "driving"),
  harmony("plagal breathing space", [0, 3, 0, 3], "mellow"),
  harmony("gentle mediant climb", [0, 2, 3, 0], "mellow", "hopeful"),
  harmony("home and dominant", [0, 0, 3, 4], "driving"),
  harmony("open-ended reflection", [0, 5, 1, 3], "mellow", "tense"),
];
const minorAcoustic = [
  harmony("minor singer-songwriter", [0, 5, 2, 6], "mellow"),
  harmony("minor lament", [0, 6, 5, 4], "mellow", "tense"),
  harmony("minor circle", [0, 3, 6, 2], "mellow"),
  harmony("minor plagal space", [0, 3, 0, 3], "mellow"),
  harmony("relative-major horizon", [2, 6, 0, 5], "hopeful"),
  harmony("stepwise lift", [5, 6, 0, 2], "hopeful", "driving"),
  harmony("home and minor dominant", [0, 0, 3, 4], "driving"),
  harmony("modal answer", [0, 2, 3, 6], "hopeful", "tense"),
];
const palettes: Record<Exclude<SketchStyle, "emotive">, SketchHarmony[]> = {
  rock: [
    harmony("anthem lift", [0, 4, 5, 3], "hopeful"),
    harmony("back-to-one", [0, 3, 4, 0], "driving"),
    harmony("relative-minor turn", [5, 3, 0, 4], "mellow"),
    harmony("plagal rock return", [0, 6, 3, 0], "driving"),
    harmony("tonic and fourth vamp", [0, 3, 0, 3], "mellow", "driving"),
    harmony("rising rock refrain", [3, 4, 0, 0], "hopeful"),
    harmony("minor descent", [0, 6, 5, 4], "tense"),
    harmony("wide-open lift", [0, 2, 3, 4], "hopeful"),
  ],
  "neo-soul": [
    harmony("modal soul vamp", [0, 3, 0, 3], "mellow"),
    harmony("two-five return", [1, 4, 0, 0], "hopeful"),
    harmony("soul turnaround", [0, 5, 1, 4], "hopeful", "driving"),
    harmony("descending soul colours", [2, 1, 0, 3], "mellow"),
    harmony("four-three-two-one", [3, 2, 1, 0], "mellow"),
    harmony("minor circle glow", [0, 3, 6, 2], "tense", "mellow"),
    harmony("soul lift and release", [3, 4, 2, 5], "hopeful"),
    harmony("soul pedal answer", [0, 0, 3, 6], "driving"),
  ],
  funk: [
    harmony("tonic funk vamp", [0, 0, 0, 3], "driving"),
    harmony("two-chord funk conversation", [0, 3, 0, 3], "mellow", "driving"),
    harmony("modal funk bounce", [0, 6, 3, 0], "driving"),
    harmony("funk call and response", [0, 3, 4, 3], "hopeful"),
    harmony("minor-third funk colour", [0, 2, 0, 3], "mellow"),
    harmony("funk turnaround", [0, 0, 3, 4], "driving"),
    harmony("soul-funk lift", [3, 4, 0, 0], "hopeful"),
    harmony("descending funk pocket", [0, 6, 5, 0], "tense"),
  ],
  prog: [
    harmony("modal journey", [0, 5, 3, 4], "hopeful"),
    harmony("tension and return", [0, 6, 3, 0], "tense"),
    harmony("rising contrast", [0, 3, 4, 0], "driving"),
    harmony("mediant horizon", [0, 2, 5, 3], "mellow", "hopeful"),
    harmony("progressive pedal", [0, 0, 3, 6], "driving"),
    harmony("fourth-cycle movement", [0, 3, 6, 2], "mellow"),
    harmony("stepwise expansion", [0, 1, 3, 4], "tense"),
    harmony("open modal ascent", [3, 4, 5, 0], "hopeful"),
  ],
  heavy: [
    harmony("dark pull", [0, 1, 6, 0], "tense"),
    harmony("dark descent", [0, 6, 1, 0], "tense"),
    harmony("riff pedal", [0, 3, 1, 0], "driving"),
    harmony("minor impact", [0, 5, 6, 0], "driving"),
    harmony("low tonic insistence", [0, 0, 1, 0], "tense"),
    harmony("open heavy lift", [0, 2, 3, 0], "hopeful"),
    harmony("heavy plagal answer", [0, 3, 0, 3], "mellow"),
    harmony("heavy modal horizon", [0, 5, 2, 6], "hopeful"),
  ],
};

/** Keep the actual selected scale authoritative, including parent harmony for pentatonic modes. */
export function harmonyLibrary(style: SketchStyle, mode: Mode): SketchHarmony[] {
  const parent =
    mode === "minor pentatonic" ? "aeolian" : mode === "major pentatonic" ? "ionian" : mode;
  const scale = getScale("C", parent).map((note) => notePitchClass(note) ?? 0);
  const minor = (scale[2] - scale[0] + 12) % 12 === 3;
  const choices = style === "emotive" ? (minor ? minorAcoustic : brightAcoustic) : palettes[style];
  // Reject diminished/augmented schema positions rather than silently changing their degree.
  const stable = choices.filter((choice) =>
    choice.degrees.every((degree) => {
      const fifth = (scale[(degree + 4) % 7] - scale[degree] + 12) % 12;
      return fifth === 7;
    }),
  );
  return stable.length >= 2
    ? stable
    : [
        harmony("modal home", [0, 0, 0, 0], "mellow", "tense"),
        harmony("modal colour", [0, 3, 0, 3], "hopeful", "driving"),
      ];
}

const eighths = [0, 2, 4, 6, 8, 10, 12, 14];
const sixteenths = Array.from({ length: 16 }, (_, index) => index);
const triplets = [0, 8 / 3, 4, 20 / 3, 8, 32 / 3, 12, 44 / 3];
const oddHats = Array.from({ length: 14 }, (_, index) => index * 2);
const groove = (
  name: string,
  kick: number[],
  snare: number[],
  hats: number[] = eighths,
  options: Partial<SketchGroove> = {},
): SketchGroove => ({ name, sourceSteps: 16, kick, snare, hats, ...options });
const grooves: Record<SketchStyle, SketchGroove[]> = {
  emotive: [
    groove("acoustic steady backbeat", [0, 8], [4, 12]),
    groove("folk boom-chick", [0, 8], [4, 12], [0, 4, 8, 12], { pickup: 14 }),
    groove("acoustic strumming pocket", [0, 6, 8], [4, 12], eighths, { pickup: 15 }),
    groove("acoustic offbeat lift", [0, 7, 10], [4, 12], eighths, { ghost: [11] }),
    groove("acoustic sixteenth motion", [0, 8, 10], [4, 12], sixteenths, { ghost: [7] }),
    groove("acoustic shuffle", [0, 8], [4, 12], triplets, { pickup: 44 / 3, shuffle: true }),
    groove("rolling six-eight", [0, 12], [12], [0, 4, 8, 12, 16, 20], {
      sourceSteps: 24,
      pickup: 20,
    }),
    groove("six-eight folk answer", [0, 8, 16], [12], [0, 4, 8, 12, 16, 20], { sourceSteps: 24 }),
    groove(
      "six-eight flowing subdivision",
      [0, 12, 20],
      [12],
      Array.from({ length: 12 }, (_, index) => index * 2),
      { sourceSteps: 24 },
    ),
    groove("acoustic waltz", [0], [4, 8], [0, 2, 4, 6, 8, 10], { sourceSteps: 12 }),
    groove("waltz pickup", [0, 10], [8], [0, 2, 4, 6, 8, 10], { sourceSteps: 12 }),
  ],
  rock: [
    groove("straight rock backbeat", [0, 8], [4, 12]),
    groove("rock push", [0, 7, 8], [4, 12]),
    groove("driving double-kick backbeat", [0, 2, 8, 10], [4, 12]),
    groove("rock anticipation", [0, 6, 8, 14], [4, 12]),
    groove("four-on-the-floor rock", [0, 4, 8, 12], [4, 12]),
    groove("rock shuffle", [0, 8, 32 / 3], [4, 12], triplets, { shuffle: true }),
    groove("sixteenth rock motion", [0, 8, 11], [4, 12], sixteenths),
    groove("rock two-bar pickup", [0, 8], [4, 12], eighths, { pickup: 15 }),
  ],
  "neo-soul": [
    groove("laid-back soul pocket", [0, 7, 10], [4, 12], eighths, { ghost: [11], swing: 0.65 }),
    groove("half-time soul shuffle", [0, 6, 10], [8], eighths, { ghost: [7, 15], swing: 0.8 }),
    groove("floating soul backbeat", [0, 5, 10, 14], [4, 12], eighths, {
      ghost: [3, 10.5],
      swing: 0.45,
    }),
    groove("soul pickup pocket", [0, 3, 8, 11], [4, 12], eighths, { ghost: [7, 15], swing: 0.7 }),
    groove("soul sixteenth conversation", [0, 7, 11], [4, 12], sixteenths, {
      ghost: [3, 10, 15],
      swing: 0.25,
    }),
    groove("soul broken-beat answer", [0, 6, 14], [4, 12], [0, 2, 5, 6, 8, 10, 13, 14], {
      ghost: [7, 11],
      swing: 0.55,
      pickup: 15,
    }),
  ],
  funk: [
    groove("syncopated funk", [0, 7, 10, 14], [4, 12], eighths, { ghost: [3, 11] }),
    groove("open funk pocket", [0, 6, 11], [4, 12], eighths, { ghost: [15], swing: 0.3 }),
    groove("funk kick conversation", [0, 3, 6, 10, 15], [4, 12], eighths, { ghost: [7, 11] }),
    groove("lean funk pickup", [0, 7, 11, 14], [4, 12], eighths, { ghost: [3, 15], swing: 0.2 }),
    groove("sixteenth funk pocket", [0, 3, 10], [4, 12], sixteenths, { ghost: [6, 11, 15] }),
    groove("funk two-bar answer", [0, 6, 10], [4, 12], eighths, { ghost: [3, 11], pickup: 15 }),
  ],
  prog: [
    groove("grouped odd-meter pulse", [0, 12, 20], [8, 24], oddHats, { sourceSteps: 28 }),
    groove("shifting accents", [0, 8, 18], [12, 24], oddHats, { sourceSteps: 28 }),
    groove("progressive three-group pocket", [0, 6, 14, 20], [8, 24], oddHats, {
      sourceSteps: 28,
      ghost: [23],
    }),
    groove("progressive seven-beat answer", [0, 8, 20], [12, 24], oddHats, {
      sourceSteps: 28,
      pickup: 26,
    }),
    groove("progressive straight fusion", [0, 6, 10], [4, 12], eighths, { ghost: [3, 11] }),
    groove("progressive half-time space", [0, 7, 10, 14], [8], eighths, { ghost: [5, 15] }),
    groove("progressive sixteenth accents", [0, 3, 8, 11], [4, 12], sixteenths),
    groove("progressive shuffled fusion", [0, 20 / 3, 8], [4, 12], triplets, { shuffle: true }),
  ],
  heavy: [
    groove("driving heavy pulse", [0, 6, 12, 20], [12, 24], oddHats, { sourceSteps: 28 }),
    groove("odd-meter half-time impact", [0, 8, 18, 22], [12, 24], oddHats, { sourceSteps: 28 }),
    groove("heavy staggered pulse", [0, 2, 10, 14, 20, 22], [12, 24], oddHats, { sourceSteps: 28 }),
    groove("heavy odd-meter pickup", [0, 6, 14, 20], [12, 24], oddHats, {
      sourceSteps: 28,
      pickup: 26,
    }),
    groove("heavy straight drive", [0, 2, 8, 10], [4, 12]),
    groove("heavy half-time breakdown", [0, 3, 6, 10, 14], [8]),
    groove("heavy gallop", [0, 2, 3, 8, 10, 11], [4, 12]),
    groove("heavy syncopated impact", [0, 3, 7, 10, 15], [8], eighths, { ghost: [5] }),
  ],
};

export function grooveLibrary(style: SketchStyle, beatsPerBar: number): SketchGroove[] {
  const sourceSteps = beatsPerBar * 4;
  const compatible = grooves[style].filter((template) => template.sourceSteps === sourceSteps);
  // Custom meters adapt the style's normal vocabulary, rather than switching genre.
  return compatible.length
    ? compatible
    : grooves[style].filter(
        (template) => template.sourceSteps === (style === "prog" || style === "heavy" ? 28 : 16),
      );
}

/** A shared clock for swung drums, chord attacks and bass; integer beats stay fixed. */
export function grooveBeat(beat: number, template: SketchGroove, beatsPerBar: number): number {
  const ratio = beatsPerBar / (template.sourceSteps / 4);
  const sourceBeat = beat / ratio;
  const fraction = ((sourceBeat % 1) + 1) % 1;
  const offset = template.shuffle ? 1 / 6 : (template.swing ?? 0) / 4;
  return Math.abs(fraction - 0.5) < 0.001 ? beat + offset * ratio : beat;
}

export function grooveNotes<T extends { start: number; duration: number }>(
  notes: T[],
  template: SketchGroove,
  beatsPerBar: number,
  cursor = 0,
): T[] {
  return notes.map((note) => {
    const start = grooveBeat(cursor + note.start, template, beatsPerBar);
    const end = grooveBeat(cursor + note.start + note.duration, template, beatsPerBar);
    return { ...note, start: start - cursor, duration: Math.max(0.01, end - start) };
  });
}
