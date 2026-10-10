import { notePitchClass, seededRandom, type Mode } from "../music-theory/index.js";
import type { DrumHit, DrumInstrument } from "../sequencing/index.js";

import {
  grooveBeat,
  grooveLibrary,
  harmonyLibrary,
  type SketchGroove,
  type SketchStyle,
} from "./sketch-library.js";
import type { MusicalDirection } from "./directions.js";
export type { SketchGroove, SketchStyle } from "./sketch-library.js";

/** Keep distorted low-register harmony open; the bass and melody supply the modal colour. */
export function heavyPowerVoicing(symbol: string): number[] {
  const root = 36 + (notePitchClass(symbol) ?? 4);
  return [root, root + 7, root + 12];
}

/** Mood weights a genre's vocabulary; it never replaces it with a shared progression. */
export function chooseSketchHarmony(
  style: SketchStyle,
  mode: Mode,
  seed: number,
  variant = 0,
  direction?: MusicalDirection,
) {
  const choices = harmonyLibrary(style, mode);
  const weighted = choices.flatMap((choice) =>
    Array.from({ length: direction && choice.moods.includes(direction) ? 3 : 1 }, () => choice),
  );
  const selected = weighted[Math.floor(seededRandom(seed + 37)() * weighted.length)];
  return choices[(choices.indexOf(selected) + variant) % choices.length];
}

/** Meter compatibility is explicit; hat count must not determine the source meter. */
export function chooseSketchGroove(
  style: SketchStyle,
  beatsPerBar: number,
  seed: number,
): SketchGroove {
  const choices = grooveLibrary(style, beatsPerBar);
  return choices[Math.floor(seededRandom(seed + 19 + beatsPerBar)() * choices.length)];
}

export function buildSketchGroove(
  template: SketchGroove,
  beatsPerBar: number,
  bars: number,
  seed: number,
  energy: "mellow" | "balanced" | "powerful",
  relation: "theme" | "develop" | "contrast" | "return",
): DrumHit[] {
  const random = seededRandom(seed),
    steps = beatsPerBar * 4,
    hits: DrumHit[] = [];
  const add = (instrument: DrumInstrument, step: number, velocity: number) => {
    if (
      step < 0 ||
      step >= steps * bars ||
      hits.some((hit) => hit.instrument === instrument && hit.step === step)
    )
      return;
    hits.push({
      instrument,
      step: Number(step.toFixed(2)),
      velocity: Number(Math.max(0.2, Math.min(1, velocity)).toFixed(2)),
    });
  };
  const scale = energy === "mellow" ? 0.72 : energy === "powerful" ? 1 : 0.87;
  for (let bar = 0; bar < bars; bar++) {
    const base = bar * steps;
    // Scale a four-beat or six-eight template into an explicitly chosen odd meter.
    const map = (step: number) =>
      grooveBeat((step * beatsPerBar) / template.sourceSteps, template, beatsPerBar) * 4;
    for (const step of template.kick)
      if (map(step) < steps)
        add("kick", base + map(step), scale * (step === 0 ? 0.94 : 0.78 + random() * 0.12));
    // A quiet, late soul backbeat is distinct from the straight rock snare.
    for (const step of template.snare)
      if (map(step) < steps)
        add(
          "snare",
          base + map(step) + (template.swing ? 0.22 : 0),
          scale * (step === 12 || step === 4 ? 0.9 : 0.82),
        );
    for (const step of template.ghost ?? [])
      if (map(step) < steps) add("snare", base + map(step), scale * (0.22 + random() * 0.12));
    for (const step of template.hats) {
      const position = map(step);
      if (position >= steps || (relation === "contrast" && step % 4 !== 0 && random() < 0.15))
        continue;
      const swung = Math.min(steps - 0.1, position);
      const funk = template.name.includes("funk");
      add(
        "hihat",
        base + swung,
        scale *
          (funk
            ? step % 4 === 0
              ? 0.39
              : 0.58 + random() * 0.06
            : step % 4 === 0
              ? 0.57
              : 0.38 + random() * 0.08),
      );
    }
    // A two-bar pickup answers the first bar without changing the pocket.
    if (bar % 2 === 1 && template.pickup !== undefined)
      add("kick", base + map(template.pickup), scale * 0.64);
    if (bar === bars - 1 && relation !== "theme" && energy !== "mellow") {
      for (let step = steps - 4; step < steps; step += 2)
        if (random() < 0.65)
          add(step === steps - 2 ? "tomlow" : "snare", base + step, 0.43 + random() * 0.18);
    }
    if (energy === "powerful" && (bar === 0 || (relation === "return" && bar === bars - 1)))
      add("crash", base, 0.75);
  }
  return hits.sort((a, b) => a.step - b.step);
}

/** Repeat a short rhythmic idea across the harmonic cycle; leave real rests between phrases. */
export function shapeSketchMotif<T extends { start: number; duration: number; velocity: number }>(
  notes: T[],
  style: SketchStyle,
  beatsPerBar: number,
  seed: number,
): T[] {
  const patterns: Record<SketchStyle, number[][]> = {
    emotive: [
      [0, 1.5, 3],
      [0, 1, 2.75],
      [0.5, 1.5, 2.5, 3.5],
      [0, 0.75, 2, 3],
      [0, 2, 3],
      [0, 1, 2, 3],
    ],
    rock: [
      [0, 0.5, 2, 3],
      [0, 1, 2.5, 3.5],
      [0, 1.5, 2, 3.5],
      [0.5, 1, 2, 3],
    ],
    "neo-soul": [
      [0.5, 1.5, 2.75, 3.5],
      [0, 1.75, 2.5, 3.25],
      [0.75, 1.5, 2, 3.5],
      [0, 1.5, 2.75, 3.75],
    ],
    funk: [
      [0, 0.75, 2.5, 3.5],
      [0.5, 1.5, 2.75, 3.5],
      [0, 0.5, 1.75, 3],
      [0.75, 1.5, 2.5, 3.75],
    ],
    prog: [
      [0, 1, 2.25, 3.25],
      [0, 1.5, 2.5, 3.5],
      [0.5, 1.25, 2.75, 3.5],
      [0, 0.75, 2, 3.25],
    ],
    heavy: [
      [0, 0.5, 1.5, 3],
      [0, 0.75, 2, 3.5],
      [0, 0.25, 1.5, 2.75],
      [0.5, 1, 2.5, 3.5],
    ],
  };
  const choices = patterns[style],
    pattern = choices[Math.floor(seededRandom(seed + 29)() * choices.length)];
  if (!notes.length) return [];
  const scale = beatsPerBar / 4;
  return notes.map((note, index) => {
    const bar = Math.floor((index * 4) / notes.length),
      position = index - Math.ceil((bar * notes.length) / 4);
    const withinBar = (pattern[position] ?? 3.7 + (position - pattern.length) * 0.15) * scale;
    const start = Number((bar * beatsPerBar + withinBar).toFixed(3));
    const next = pattern[position + 1] ?? 4;
    const space = Math.max(0.125, (next - (pattern[position] ?? 3.7)) * scale);
    const duration =
      index === notes.length - 1
        ? beatsPerBar * 4 - start
        : Math.max(0.125, Math.min(space * 0.82, style === "emotive" ? 2 * scale : 0.9 * scale));
    return {
      ...note,
      start,
      duration: Number(duration.toFixed(3)),
      velocity: Number((0.56 + (position === 0 ? 0.17 : 0.04) + (bar === 2 ? 0.06 : 0)).toFixed(2)),
    };
  });
}
