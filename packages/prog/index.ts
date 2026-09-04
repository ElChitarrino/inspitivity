import {
  getScale,
  notePitchClass,
  type Mode,
  type Root,
} from "../music-theory/index.js";

export const PROG_METERS = ["4/4", "5/4", "7/8", "9/8", "11/8"] as const;
export type HarmonyColour =
  | "diatonic"
  | "modal interchange"
  | "chromatic mediant"
  | "quartal"
  | "pedal point";
export type MotifTransform =
  "invert" | "retrograde" | "augment" | "diminish" | "transpose";
export type TransitionStyle =
  | "metric modulation"
  | "tempo ramp"
  | "drum fill"
  | "pivot chord"
  | "pedal point"
  | "riff mutation";
export type PatternMotion = "anchor" | "rise" | "fall" | "orbit";
export type RiffEvent = {
  pitch: number;
  start: number;
  duration: number;
  accent: boolean;
  muted: boolean;
};

const ROOTS: Root[] = [
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

function randomFrom(seed: number) {
  let value = (Math.abs(Math.trunc(seed)) || 1) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function meterBeats(meter: string) {
  return Math.max(1, Math.min(16, Number(meter.split("/")[0]) || 4));
}

export function nextProgMeter(meter: string) {
  const index = PROG_METERS.indexOf(meter as (typeof PROG_METERS)[number]);
  return PROG_METERS[(index + 1 + PROG_METERS.length) % PROG_METERS.length];
}

export function meterMapTotal(map: string[], fallback = "4/4") {
  return (map.length ? map : [fallback]).reduce(
    (sum, meter) => sum + meterBeats(meter),
    0,
  );
}

export function generateProgRiff({
  root,
  mode,
  beats = 4,
  cycle = 5,
  grouping = "3+3+2",
  density = 0.72,
  seed = 1,
  startOffset = 0.5,
  motion = "orbit",
}: {
  root: Root;
  mode: Mode;
  beats?: number;
  cycle?: number;
  grouping?: string;
  density?: number;
  seed?: number;
  startOffset?: number;
  motion?: PatternMotion;
}): RiffEvent[] {
  const scale = getScale(root, mode);
  const random = randomFrom(seed);
  const basePitch = 48 + (notePitchClass(root) ?? 0);
  const pulses = grouping.split("+").map(Number).filter((value) => value > 0);
  const cycleUnits = Math.max(3, Math.min(14, Math.round(cycle))) * 2;
  const totalUnits = Math.max(4, Math.round(beats * 2));
  const offsetUnits = Math.max(0, Math.round(startOffset * 2));
  const degreeShapes: Record<PatternMotion, number[]> = {
    anchor: [4, 4, 2, 4],
    rise: [2, 3, 4, 5],
    fall: [5, 4, 3, 2],
    orbit: [4, 2, 5, 3],
  };
  const shape = degreeShapes[motion];
  const events: RiffEvent[] = [];
  const onsets: number[] = [];
  let groupCursor = offsetUnits;
  let groupIndex = 0;
  while (groupCursor < totalUnits) {
    onsets.push(groupCursor);
    groupCursor += pulses[groupIndex % Math.max(1, pulses.length)] ?? 2;
    groupIndex++;
  }
  for (let index = 0; index < onsets.length; index++) {
    const unit = onsets[index];
    const cyclePosition = unit % cycleUnits;
    const phrasePosition = index % shape.length;
    const keep = phrasePosition === 0 || random() < Math.max(0.45, density);
    if (!keep) continue;
    let degree = shape[phrasePosition] % scale.length;
    // One restrained turnaround variation prevents a long loop feeling pasted.
    if (index > 0 && index % 8 === 7)
      degree = Math.max(0, Math.min(scale.length - 1, degree + (seed % 2 ? -1 : 1)));
    const pitchClass = notePitchClass(scale[degree]) ?? notePitchClass(root) ?? 0;
    const pitch = basePitch + ((pitchClass - (notePitchClass(root) ?? 0) + 12) % 12);
    const nextUnit = onsets[index + 1] ?? Math.min(totalUnits, unit + 2);
    const available = Math.max(0.25, (nextUnit - unit) / 2);
    events.push({
      pitch,
      start: unit / 2,
      duration: Math.min(0.72, available * 0.72),
      accent: phrasePosition === 0 || cyclePosition === offsetUnits,
      muted: false,
    });
  }
  return events.length
    ? events
    : [
        {
          pitch: basePitch + 7,
          start: Math.min(startOffset, Math.max(0, beats - 0.5)),
          duration: 0.4,
          accent: true,
          muted: false,
        },
      ];
}

export function applyHarmonyColour(
  chord: string,
  root: Root,
  colour: HarmonyColour,
  index: number,
) {
  if (colour === "diatonic") return chord;
  const rootIndex = ROOTS.indexOf(root);
  if (colour === "modal interchange" && index % 3 === 1)
    return `${ROOTS[(rootIndex + 8) % 12]}maj7`;
  if (colour === "chromatic mediant" && index % 3 === 1)
    return `${ROOTS[(rootIndex + (index % 2 ? 4 : 8)) % 12]}maj7`;
  if (colour === "quartal")
    return `${chord.replace(/(maj|m)?(?:7|9|11|13)?$/, "")}4th`;
  if (colour === "pedal point") return `${chord}/${root}`;
  return chord;
}

export function transformMotif<
  T extends { pitch: number; start: number; duration: number },
>(notes: T[], transform: MotifTransform): T[] {
  if (!notes.length) return notes;
  const origin = notes[0].pitch;
  const end = Math.max(...notes.map((note) => note.start + note.duration));
  return notes
    .map((note, index) => {
      if (transform === "invert")
        return {
          ...note,
          pitch: Math.max(36, Math.min(96, origin - (note.pitch - origin))),
        };
      if (transform === "retrograde")
        return {
          ...note,
          start: Math.max(0, end - note.start - note.duration),
        };
      if (transform === "augment")
        return { ...note, start: note.start * 2, duration: note.duration * 2 };
      if (transform === "diminish")
        return {
          ...note,
          start: note.start / 2,
          duration: Math.max(0.125, note.duration / 2),
        };
      return {
        ...note,
        pitch: Math.max(36, Math.min(96, note.pitch + (index % 2 ? 5 : 7))),
      };
    })
    .sort((a, b) => a.start - b.start);
}

export function classifyTension(pitch: number, chord: string) {
  const root = notePitchClass(chord) ?? 0;
  const interval = (pitch - root + 120) % 12;
  if ([0, 3, 4, 7, 10, 11].includes(interval)) return "chord tone";
  if ([1, 2, 5, 6, 9].includes(interval)) return "colour tension";
  return "outside";
}

export function transitionDescription(
  style: TransitionStyle,
  fromMeter: string,
  toMeter: string,
) {
  const labels: Record<TransitionStyle, string> = {
    "metric modulation": `Reframe the pulse from ${fromMeter} into ${toMeter}.`,
    "tempo ramp": "Expand the tempo gradually across the final bar.",
    "drum fill": "Use a cymbal-led fill to pull the next section forward.",
    "pivot chord":
      "Hold a shared chord tone while the harmony changes underneath.",
    "pedal point": "Keep the root ringing while the colours move above it.",
    "riff mutation":
      "Displace the riff accent pattern, then resolve it on the downbeat.",
  };
  return labels[style];
}
