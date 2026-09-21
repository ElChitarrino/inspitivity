import {
  getScale,
  notePitchClass,
  seededRandom,
  type Mode,
  type Root,
} from "../music-theory/index.js";
import { meterBeats } from "../prog/index.js";

export type BassDirection =
  | "sustained"
  | "eighth notes"
  | "groove"
  | "syncopated"
  | "progressive";
export type BassMovement = "rooted" | "supportive" | "melodic";
export type BassEvent = {
  pitch: number;
  start: number;
  duration: number;
  accent: boolean;
};

export type BassHarmonyEvent = { symbol: string; beats: number };
export type BassGenerationOptions = {
  length: number;
  meter: string;
  meterMap?: string[];
  root: Root;
  mode: Mode;
  harmony: BassHarmonyEvent[];
  direction: BassDirection;
  movement: BassMovement;
  lockToKick: boolean;
  kickStarts?: number[];
  kickCycle?: number;
  otherActivity?: number;
  density?: number;
  seed: number;
};

type TimedHarmony = BassHarmonyEvent & { start: number; end: number; root: number };

const round = (value: number, step = 0.125) =>
  Math.round(value / step) * step;
const closeTo = (value: number, values: number[], tolerance = 0.07) =>
  values.some((candidate) => Math.abs(candidate - value) <= tolerance);

function bassRootPitch(symbol: string) {
  const pitchClass = notePitchClass(symbol) ?? 0;
  return pitchClass === 11 ? 23 : 24 + pitchClass;
}

function playablePitch(pitchClass: number, previous: number, centre: number) {
  const candidates: number[] = [];
  for (let pitch = 23; pitch <= 55; pitch += 1)
    if ((pitch % 12 + 12) % 12 === (pitchClass % 12 + 12) % 12)
      candidates.push(pitch);
  return candidates.sort(
    (a, b) =>
      Math.abs(a - previous) * 1.35 + Math.abs(a - centre) -
      (Math.abs(b - previous) * 1.35 + Math.abs(b - centre)),
  )[0] ?? Math.max(23, Math.min(55, centre));
}

function buildHarmonyTimeline(
  harmony: BassHarmonyEvent[],
  length: number,
  fallbackRoot: Root,
) {
  const safeHarmony = harmony.length
    ? harmony.map((event) => ({ ...event, beats: Math.max(0.25, event.beats) }))
    : [{ symbol: fallbackRoot, beats: length }];
  const timeline: TimedHarmony[] = [];
  let cursor = 0;
  let index = 0;
  while (cursor < length - 0.001) {
    const chord = safeHarmony[index % safeHarmony.length];
    const end = Math.min(length, cursor + chord.beats);
    timeline.push({
      ...chord,
      start: round(cursor),
      end: round(end),
      root: bassRootPitch(chord.symbol),
    });
    cursor = end;
    index += 1;
  }
  return timeline;
}

function buildBars(length: number, meter: string, meterMap: string[] = []) {
  const bars: Array<{ start: number; length: number; index: number }> = [];
  let cursor = 0;
  let index = 0;
  while (cursor < length - 0.001) {
    const barLength = meterBeats(meterMap[index] ?? meter);
    bars.push({ start: cursor, length: Math.min(barLength, length - cursor), index });
    cursor += barLength;
    index += 1;
  }
  return bars;
}

function progressiveOffsets(beats: number, random: () => number) {
  const eighths = Math.max(2, Math.round(beats * 2));
  const groupings: Record<number, number[][]> = {
    8: [[3, 3, 2], [2, 3, 3], [3, 2, 3]],
    10: [[3, 3, 2, 2], [2, 3, 3, 2]],
    14: [[3, 2, 2, 3, 2, 2], [2, 3, 2, 2, 3, 2]],
  };
  const available = groupings[eighths] ?? [];
  const groups = available.length
    ? available[Math.floor(random() * available.length)]
    : Array.from({ length: Math.ceil(eighths / 3) }, (_, index) =>
        Math.min(index % 2 ? 2 : 3, eighths - index * 3),
      ).filter((value) => value > 0);
  const result = [0];
  let cursor = 0;
  for (const group of groups) {
    cursor += group / 2;
    if (cursor < beats - 0.1) result.push(round(cursor));
  }
  return result;
}

function rhythmCandidates(
  direction: BassDirection,
  barLength: number,
  random: () => number,
) {
  if (direction === "sustained") return [0];
  if (direction === "progressive") return progressiveOffsets(barLength, random);

  const templates: Record<Exclude<BassDirection, "sustained" | "progressive">, number[][]> = {
    "eighth notes": [
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      [0, 0.5, 1.5, 2, 2.5, 3.5],
      [0, 1, 1.5, 2, 3, 3.5],
    ],
    groove: [
      [0, 1, 1.5, 2.75, 3.5],
      [0, 0.75, 1.5, 2.5, 3],
      [0, 1, 2.25, 2.75, 3.5],
      [0, 0.5, 1.75, 2.5, 3.25],
    ],
    syncopated: [
      [0, 0.75, 1.5, 2.5, 3.25],
      [0, 0.5, 1.75, 2.75, 3.5],
      [0, 1.25, 1.75, 2.5, 3.75],
      [0, 0.75, 2, 2.75, 3.25],
    ],
  };
  const choices = templates[direction];
  const chosen = choices[Math.floor(random() * choices.length)];
  const scale = barLength / 4;
  return chosen.map((value) => round(value * scale)).filter((value) => value < barLength - 0.08);
}

function choosePitch(
  eventStart: number,
  index: number,
  harmony: TimedHarmony[],
  scale: number[],
  movement: BassMovement,
  previous: number,
  random: () => number,
) {
  const chordIndex = Math.max(
    0,
    harmony.findIndex((chord) => eventStart >= chord.start - 0.01 && eventStart < chord.end - 0.01),
  );
  const chord = harmony[chordIndex] ?? harmony[0];
  const nextChord = harmony[chordIndex + 1];
  const onChange = Math.abs(eventStart - chord.start) < 0.07;
  const leadingIntoChange = nextChord && nextChord.start - eventStart <= 0.65;
  const chordPc = (chord.root % 12 + 12) % 12;

  if (onChange || index === 0)
    return playablePitch(chordPc, previous, chord.root + (movement === "melodic" && random() > 0.72 ? 12 : 0));

  if (leadingIntoChange && random() < (movement === "rooted" ? 0.2 : movement === "supportive" ? 0.52 : 0.78)) {
    const nextPc = (nextChord.root % 12 + 12) % 12;
    const scaleSteps = scale.filter((pitchClass) => {
      const distance = Math.min((pitchClass - nextPc + 12) % 12, (nextPc - pitchClass + 12) % 12);
      return distance <= 2 && pitchClass !== nextPc;
    });
    if (scaleSteps.length)
      return playablePitch(scaleSteps[Math.floor(random() * scaleSteps.length)], previous, nextChord.root);
  }

  const minor = /(?:^|[^a-z])m(?!aj)|dim|°/i.test(chord.symbol.replace(/^[A-G](?:b|#)?/, ""));
  const pools: Record<BassMovement, number[]> = {
    rooted: [0, 0, 0, 0, 7, 12],
    supportive: [0, 0, 7, 7, 12, minor ? 3 : 4, -2, 2],
    melodic: [0, 7, 12, minor ? 3 : 4, 2, 5, 9, -2],
  };
  let interval = pools[movement][Math.floor(random() * pools[movement].length)];
  let pitchClass = (chordPc + interval + 24) % 12;
  if (!scale.includes(pitchClass) && ![0, 7, minor ? 3 : 4].includes(interval)) {
    const nearestScale = scale.slice().sort((a, b) => {
      const aDistance = Math.min((a - pitchClass + 12) % 12, (pitchClass - a + 12) % 12);
      const bDistance = Math.min((b - pitchClass + 12) % 12, (pitchClass - b + 12) % 12);
      return aDistance - bDistance;
    });
    pitchClass = nearestScale[0] ?? chordPc;
    interval = pitchClass - chordPc;
  }
  const centre = chord.root + (interval >= 9 || movement === "melodic" && random() > 0.62 ? 12 : 0);
  return playablePitch(pitchClass, previous, centre);
}

export function generateBassPhrase(options: BassGenerationOptions): BassEvent[] {
  const length = Math.max(0.5, options.length);
  const random = seededRandom(options.seed);
  const harmony = buildHarmonyTimeline(options.harmony, length, options.root);
  const bars = buildBars(length, options.meter, options.meterMap);
  const scale = getScale(options.root, options.mode)
    .map(notePitchClass)
    .filter((pitch): pitch is number => pitch !== null);
  const activityReduction = Math.max(0, Math.min(0.2, (options.otherActivity ?? 0) * 0.08));

  const repeatedKicks: number[] = [];
  const kickCycle = Math.max(0.5, options.kickCycle ?? meterBeats(options.meter));
  if (options.kickStarts?.length)
    for (let offset = 0; offset < length; offset += kickCycle)
      for (const kick of options.kickStarts)
        if (offset + kick < length - 0.04) repeatedKicks.push(round(offset + kick));

  const mandatory = [...new Set([
    ...harmony.map((chord) => chord.start),
    ...bars.map((bar) => bar.start),
  ])];
  const starts: number[] = [...mandatory];
  for (const bar of bars) {
    const base = rhythmCandidates(options.direction, bar.length, random);
    const keepChance = {
      sustained: 0,
      "eighth notes": 0.8,
      groove: 0.74,
      syncopated: 0.72,
      progressive: 0.8,
    }[options.direction] - activityReduction + ((options.density ?? .6) - .6) * .75;

    for (const offset of base) {
      const start = round(bar.start + offset);
      if (closeTo(start, mandatory)) continue;
      const kickBoost = closeTo(start, repeatedKicks) ? (options.lockToKick ? 0.28 : 0.08) : 0;
      const evolvingBarPenalty = bar.index > 0 && (bar.index + Math.floor(random() * 3)) % 3 === 0 ? 0.09 : 0;
      if (random() < keepChance + kickBoost - evolvingBarPenalty) starts.push(start);
    }

    if (options.direction === "sustained") {
      const target = harmony.find((chord) => chord.start > bar.start + 0.2 && chord.start <= bar.start + bar.length + 0.01);
      if (target && random() < (options.movement === "rooted" ? 0.18 : 0.5))
        starts.push(round(Math.max(bar.start, target.start - (random() > 0.5 ? 0.5 : 0.25))));
    } else if (random() < (options.movement === "melodic" ? 0.62 : 0.32)) {
      const pickup = round(bar.start + bar.length - (random() > 0.5 ? 0.5 : 0.25));
      if (pickup > bar.start && pickup < length) starts.push(pickup);
    }
  }

  if (options.lockToKick)
    for (const kick of repeatedKicks)
      if (random() < 0.72 && !closeTo(kick, starts, 0.12)) starts.push(kick);

  const uniqueStarts = [...new Set(starts.map((start) => round(start)))]
    .filter((start) => start >= 0 && start < length)
    .sort((a, b) => a - b)
    .filter((start, index, all) => index === 0 || start - all[index - 1] >= 0.2);

  let previous = harmony[0]?.root ?? bassRootPitch(options.root);
  const pitched = uniqueStarts.map((start, index) => {
    const pitch = choosePitch(start, index, harmony, scale, options.movement, previous, random);
    previous = pitch;
    return { start, pitch };
  });

  return pitched.map(({ start, pitch }, index) => {
    const next = pitched[index + 1]?.start ?? length;
    const available = Math.max(0.125, next - start);
    const gateRange: Record<BassDirection, [number, number]> = {
      sustained: [0.84, 0.98],
      "eighth notes": [0.56, 0.86],
      groove: [0.46, 0.9],
      syncopated: [0.38, 0.76],
      progressive: [0.42, 0.84],
    };
    const [minimum, maximum] = gateRange[options.direction];
    const gate = minimum + random() * (maximum - minimum);
    const duration = Math.max(0.125, Math.min(2.5, round(available * gate)));
    const chordAccent = closeTo(start, mandatory);
    const kickAccent = closeTo(start, repeatedKicks, 0.09);
    const barAccent = bars.some((bar) => Math.abs(bar.start - start) < 0.07);
    return {
      pitch,
      start,
      duration,
      accent: chordAccent || barAccent || kickAccent && random() < 0.82 || random() < 0.12,
    };
  });
}
