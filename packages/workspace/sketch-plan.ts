import { seededRandom, type Complexity, type Mode } from "../music-theory/index.js";
import type { ChordRhythm } from "../music-theory/chord-rhythm.js";
import type { BassDirection } from "./bass.js";
import type { MusicalDirection } from "./directions.js";
import { chooseSketchGroove, chooseSketchHarmony, type SketchStyle } from "./sketch-grammar.js";

export type SketchIntensity = "mellow" | "steady" | "hard";
export type SketchRelation = "theme" | "develop" | "contrast" | "return";

const rhythms: Record<SketchStyle, readonly ChordRhythm[]> = {
  emotive: ["sustain", "quarters", "eighths", "tresillo", "offbeat"],
  rock: ["quarters", "eighths", "backbeat", "driving"],
  "neo-soul": ["syncopated", "offbeat", "sparse", "tresillo"],
  funk: ["offbeat", "syncopated", "tresillo", "backbeat"],
  prog: ["adaptive", "syncopated", "quarters", "tresillo"],
  heavy: ["driving", "syncopated", "eighths", "backbeat"],
};

/** One plan per song: return sections reuse its harmony, rhythm and groove. */
export function createSketchPlan(
  style: SketchStyle,
  mode: Mode,
  meter: string,
  seed: number,
  direction?: MusicalDirection,
  intensity: SketchIntensity = "steady",
) {
  const random = seededRandom(seed + 1013);
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const beats = Number(meter.split("/")[0]) || 4;
  const harmony = chooseSketchHarmony(style, mode, seed, 0, direction);
  const contrastHarmony = chooseSketchHarmony(style, mode, seed, 1, direction);
  const groove = chooseSketchGroove(style, beats, seed);
  // Silence and note duration carry mellow intensity; the groove remains perceptible.
  const rhythm = pick(rhythms[style]);
  const complexity: Complexity =
    style === "heavy" || style === "rock"
      ? "simple"
      : style === "emotive"
        ? pick(["simple", "medium"] as const)
        : "advanced";
  const lengths = pick([
    [1, 1, 1, 1],
    [2, 1, 0.5, 0.5],
    [1.5, 0.5, 1, 1],
    [0.5, 0.5, 1, 2],
  ]);
  const chordBeats = lengths.map((length) => length * beats);
  const bassDirection: BassDirection =
    intensity === "hard"
      ? "progressive"
      : style === "funk" || style === "neo-soul"
        ? "syncopated"
        : style === "prog"
          ? "progressive"
          : style === "emotive" && rhythm === "sustain"
            ? "sustained"
            : "groove";
  return { harmony, contrastHarmony, groove, rhythm, complexity, chordBeats, bassDirection };
}

export function sketchSectionRhythm(
  plan: ReturnType<typeof createSketchPlan>,
  relation: SketchRelation,
): ChordRhythm {
  if (relation === "contrast") return plan.rhythm === "sustain" ? "quarters" : "sparse";
  // Retain the hook's exact rhythm on return; develop through voicing, phrasing and dynamics.
  return plan.rhythm;
}

/** Quarter-note BPM in every meter. Mellow does not imply a slow or half-time beat. */
export function randomizeSketchTiming(
  style: SketchStyle,
  direction: MusicalDirection,
  seed: number,
) {
  const random = seededRandom(seed + 2017);
  type Timing = { meter: string; min: number; max: number };
  const families: Record<SketchStyle, Timing[]> = {
    emotive: [
      { meter: "4/4", min: 90, max: 126 },
      { meter: "4/4", min: 76, max: 100 },
      { meter: "6/8", min: 88, max: 120 },
      { meter: "3/4", min: 96, max: 132 },
    ],
    rock: [
      { meter: "4/4", min: 94, max: 124 },
      { meter: "4/4", min: 124, max: 154 },
    ],
    "neo-soul": [
      { meter: "4/4", min: 78, max: 102 },
      { meter: "4/4", min: 102, max: 122 },
    ],
    funk: [
      { meter: "4/4", min: 92, max: 112 },
      { meter: "4/4", min: 112, max: 132 },
    ],
    prog: [
      { meter: "4/4", min: 98, max: 136 },
      { meter: "7/8", min: 108, max: 148 },
      { meter: "5/4", min: 94, max: 126 },
    ],
    heavy: [
      { meter: "4/4", min: 112, max: 158 },
      { meter: "7/8", min: 120, max: 164 },
      { meter: "4/4", min: 88, max: 116 },
    ],
  };
  const family = families[style][Math.floor(random() * families[style].length)];
  const shift = direction === "driving" ? 6 : direction === "mellow" ? -2 : 0;
  return {
    meter: family.meter,
    bpm: family.min + shift + Math.floor(random() * (family.max - family.min + 1)),
  };
}
