import type {
  Root,
  Mode,
  MelodyMood,
  ProgressionOpening,
  HarmonicTension,
} from "../music-theory/index.js";
import type { SketchStyle } from "./sketch-grammar.js";
import type { MusicalDirection } from "./directions.js";

export type SketchPreset = {
  id: SketchStyle;
  label: string;
  copy: string;
  accent: string;
  root: Root;
  mode: Mode;
  bpm: number;
  meter: string;
  mood: MelodyMood;
  opening: ProgressionOpening;
  tension: HarmonicTension;
};
export type SketchOptions = {
  root: Root;
  mode: Mode;
  bpm: number;
  meter: string;
  includeMelody: boolean;
  includePattern: boolean;
  extendedForm: boolean;
  intensity: "mellow" | "steady" | "hard";
  direction?: MusicalDirection;
  brief?: string;
};

export const SKETCH_PRESETS: SketchPreset[] = [
  {
    id: "emotive",
    label: "Mellow acoustic",
    copy: "Soft acoustic colour, varied grooves and room to breathe",
    accent: "◌",
    root: "A",
    mode: "minor",
    bpm: 104,
    meter: "4/4",
    mood: "melancholic",
    opening: "away",
    tension: "smooth",
  },
  {
    id: "rock",
    label: "Straight rock",
    copy: "A firm backbeat, familiar lift and singable hook",
    accent: "▰",
    root: "C",
    mode: "ionian",
    bpm: 112,
    meter: "4/4",
    mood: "bright",
    opening: "tonic",
    tension: "balanced",
  },
  {
    id: "neo-soul",
    label: "Soulful groove",
    copy: "Syncopated pocket, warm harmony and active bass",
    accent: "✦",
    root: "E",
    mode: "dorian",
    bpm: 102,
    meter: "4/4",
    mood: "calm",
    opening: "away",
    tension: "balanced",
  },
  {
    id: "funk",
    label: "Funk pocket",
    copy: "Syncopated bass and drums around a lean modal vamp",
    accent: "♬",
    root: "E",
    mode: "mixolydian",
    bpm: 106,
    meter: "4/4",
    mood: "bright",
    opening: "tonic",
    tension: "balanced",
  },
  {
    id: "prog",
    label: "Progressive motion",
    copy: "Odd-meter accents, evolving motifs and riffs",
    accent: "⌁",
    root: "E",
    mode: "dorian",
    bpm: 120,
    meter: "7/8",
    mood: "bright",
    opening: "surprise",
    tension: "balanced",
  },
  {
    id: "heavy",
    label: "Heavy riffs",
    copy: "Driven guitars, forceful drums and low bass",
    accent: "◆",
    root: "Eb",
    mode: "phrygian",
    bpm: 132,
    meter: "7/8",
    mood: "dark",
    opening: "surprise",
    tension: "bold",
  },
];

export const SKETCH_FORMS: Record<
  SketchPreset["id"],
  Array<Array<{ name: string; color: string; energy: number }>>
> = {
  emotive: [
    [
      { name: "Intro", color: "violet", energy: 0.32 },
      { name: "Verse", color: "mint", energy: 0.48 },
      { name: "Bloom", color: "amber", energy: 0.64 },
    ],
    [
      { name: "Verse", color: "blue", energy: 0.4 },
      { name: "Lift", color: "violet", energy: 0.58 },
      { name: "Release", color: "mint", energy: 0.34 },
      { name: "Outro", color: "amber", energy: 0.24 },
    ],
    [
      { name: "Prelude", color: "blue", energy: 0.25 },
      { name: "Verse", color: "mint", energy: 0.42 },
      { name: "Refrain", color: "violet", energy: 0.62 },
      { name: "Verse Return", color: "mint", energy: 0.48 },
      { name: "Coda", color: "amber", energy: 0.3 },
    ],
    [
      { name: "Theme", color: "violet", energy: 0.38 },
      { name: "Answer", color: "blue", energy: 0.5 },
      { name: "Open Sky", color: "amber", energy: 0.68 },
      { name: "Theme Return", color: "mint", energy: 0.36 },
    ],
  ],
  rock: [
    [
      { name: "Verse", color: "blue", energy: 0.48 },
      { name: "Chorus", color: "coral", energy: 0.76 },
      { name: "Verse Return", color: "mint", energy: 0.56 },
    ],
    [
      { name: "Intro", color: "mint", energy: 0.36 },
      { name: "Verse", color: "blue", energy: 0.52 },
      { name: "Chorus", color: "coral", energy: 0.78 },
      { name: "Outro", color: "amber", energy: 0.42 },
    ],
    [
      { name: "Verse", color: "blue", energy: 0.52 },
      { name: "Pre-Chorus", color: "violet", energy: 0.64 },
      { name: "Chorus", color: "coral", energy: 0.82 },
      { name: "Bridge", color: "amber", energy: 0.4 },
      { name: "Chorus Return", color: "coral", energy: 0.84 },
    ],
  ],
  "neo-soul": [
    [
      { name: "Pocket A", color: "mint", energy: 0.48 },
      { name: "Turn", color: "violet", energy: 0.58 },
      { name: "Hook", color: "amber", energy: 0.66 },
    ],
    [
      { name: "Intro", color: "blue", energy: 0.36 },
      { name: "Verse", color: "mint", energy: 0.52 },
      { name: "Lift", color: "violet", energy: 0.62 },
      { name: "Return", color: "amber", energy: 0.54 },
    ],
    [
      { name: "Pickup", color: "blue", energy: 0.4 },
      { name: "Pocket A", color: "mint", energy: 0.52 },
      { name: "Pocket B", color: "violet", energy: 0.58 },
      { name: "Hook", color: "amber", energy: 0.7 },
      { name: "Tag", color: "coral", energy: 0.46 },
    ],
    [
      { name: "Verse", color: "mint", energy: 0.46 },
      { name: "Pre-Hook", color: "blue", energy: 0.6 },
      { name: "Hook", color: "amber", energy: 0.68 },
      { name: "Break", color: "violet", energy: 0.38 },
    ],
  ],
  funk: [
    [
      { name: "Pocket A", color: "mint", energy: 0.55 },
      { name: "Pocket B", color: "violet", energy: 0.65 },
      { name: "Hook Return", color: "amber", energy: 0.73 },
    ],
    [
      { name: "Intro", color: "blue", energy: 0.4 },
      { name: "Verse", color: "mint", energy: 0.59 },
      { name: "Break", color: "violet", energy: 0.38 },
      { name: "Hook Return", color: "amber", energy: 0.76 },
    ],
    [
      { name: "Pocket A", color: "mint", energy: 0.55 },
      { name: "Answer", color: "blue", energy: 0.64 },
      { name: "Break", color: "violet", energy: 0.38 },
      { name: "Hook", color: "amber", energy: 0.76 },
      { name: "Pocket Return", color: "mint", energy: 0.68 },
    ],
  ],
  prog: [
    [
      { name: "Theme A", color: "violet", energy: 0.44 },
      { name: "Development", color: "blue", energy: 0.6 },
      { name: "Return", color: "amber", energy: 0.7 },
    ],
    [
      { name: "Intro", color: "mint", energy: 0.36 },
      { name: "Theme", color: "violet", energy: 0.54 },
      { name: "Contrast", color: "blue", energy: 0.46 },
      { name: "Climax", color: "coral", energy: 0.76 },
    ],
    [
      { name: "Motif", color: "mint", energy: 0.42 },
      { name: "Expansion", color: "violet", energy: 0.58 },
      { name: "Half-Time", color: "blue", energy: 0.4 },
      { name: "Motif Return", color: "amber", energy: 0.68 },
      { name: "Resolve", color: "coral", energy: 0.52 },
    ],
    [
      { name: "Pulse", color: "blue", energy: 0.48 },
      { name: "Theme A", color: "violet", energy: 0.58 },
      { name: "Interlude", color: "mint", energy: 0.34 },
      { name: "Theme B", color: "amber", energy: 0.66 },
      { name: "Finale", color: "coral", energy: 0.8 },
    ],
  ],
  heavy: [
    [
      { name: "Intro", color: "blue", energy: 0.34 },
      { name: "Riff A", color: "violet", energy: 0.62 },
      { name: "Impact", color: "coral", energy: 0.82 },
    ],
    [
      { name: "Pulse", color: "mint", energy: 0.5 },
      { name: "Riff A", color: "violet", energy: 0.7 },
      { name: "Contrast", color: "blue", energy: 0.42 },
      { name: "Return", color: "coral", energy: 0.86 },
    ],
    [
      { name: "Tension", color: "blue", energy: 0.4 },
      { name: "Riff A", color: "violet", energy: 0.72 },
      { name: "Breakdown", color: "coral", energy: 0.88 },
      { name: "Clean Air", color: "mint", energy: 0.34 },
      { name: "Final Impact", color: "amber", energy: 0.92 },
    ],
    [
      { name: "Stab", color: "coral", energy: 0.66 },
      { name: "Verse", color: "violet", energy: 0.72 },
      { name: "Hook", color: "amber", energy: 0.82 },
      { name: "Drop", color: "blue", energy: 0.9 },
    ],
  ],
};
