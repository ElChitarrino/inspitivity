import { notePitchClass, type Mode, type Root } from "../music-theory/index.js";
import type { MusicalDirection } from "./directions.js";
import type { SketchStyle } from "./sketch-grammar.js";

export type SongBrief = {
  style?: SketchStyle;
  direction?: MusicalDirection;
  intensity?: "mellow" | "steady" | "hard";
  bpm?: number;
  meter?: string;
  root?: Root;
  mode?: Mode;
  includeMelody?: boolean;
  includePattern?: boolean;
  recognized: string[];
};
const ROOTS: Root[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Explicit musical cues only. Unrecognized prose remains the user's saved brief. */
export function interpretSongBrief(text: string): SongBrief {
  const result: SongBrief = { recognized: [] };
  const positiveText = text.replace(
    /\b(?:no|not|without|ohne|kein|keine)\s+(?:heavy|metal|djent|distorted|aggressive|riff|pattern|synth|melody)\b/gi,
    "",
  );
  const rules: [RegExp, SketchStyle][] = [
    [/\b(neo[ -]?soul|jazz|soulful)\b/i, "neo-soul"],
    [/\b(fusion|progressive|prog|plini)\b/i, "prog"],
    [/\b(metal|djent|heavy)\b/i, "heavy"],
    [/\bfunk\b/i, "funk"],
    [/\brock\b/i, "rock"],
    [/\b(ambient|acoustic|akustisch)\b/i, "emotive"],
  ];
  result.style = rules.find(([pattern]) => pattern.test(positiveText))?.[1];
  if (/\b(tense|dark|angry|düster|spannung)\b/i.test(positiveText)) result.direction = "tense";
  else if (/\b(hopeful|uplifting|bright|hoffnung|hoffnungsvoll)\b/i.test(positiveText))
    result.direction = "hopeful";
  else if (/\b(driving|energetic|treibend|energetisch)\b/i.test(positiveText))
    result.direction = "driving";
  else if (/\b(mellow|sad|tender|nostalgic|melancholic|sanft|traurig|ruhig)\b/i.test(positiveText))
    result.direction = "mellow";
  if (/\b(soft|mellow|gentle|sanft|ruhig)\b/i.test(positiveText)) result.intensity = "mellow";
  else if (/\b(distorted|heavy|aggressive|djent|verzerrt|hart)\b/i.test(positiveText))
    result.intensity = "hard";
  const tempo = text.match(/\b(\d{2,3})\s*(?:bpm|beats per minute)\b/i);
  if (tempo && Number(tempo[1]) >= 40 && Number(tempo[1]) <= 240) result.bpm = Number(tempo[1]);
  const meter = text.match(/\b(\d{1,2})\/(4|8)\b/);
  if (meter && Number(meter[1]) >= 1 && Number(meter[1]) <= 16)
    result.meter = `${Number(meter[1])}/${meter[2]}`;
  const key = text.match(
    /\b([A-G])([#b]?)\s+(major|minor|ionian|aeolian|dorian|phrygian|lydian|mixolydian|dur|moll)\b/i,
  );
  if (key) {
    const index = notePitchClass(key[1].toUpperCase() + key[2]);
    if (index !== null) result.root = ROOTS[index];
    const name = key[3].toLowerCase();
    result.mode =
      name === "major" || name === "dur"
        ? "ionian"
        : name === "minor" || name === "moll"
          ? "aeolian"
          : (name as Mode);
  }
  if (/\b(no melody|without melody|backing track|ohne melodie|begleitung)\b/i.test(text))
    result.includeMelody = false;
  if (/\b(no pattern|without pattern|ohne pattern)\b/i.test(text)) result.includePattern = false;
  else if (/\b(riff|pattern)\b/i.test(text)) result.includePattern = true;
  for (const [name, value] of Object.entries(result))
    if (name !== "recognized" && value !== undefined) result.recognized.push(`${name}: ${value}`);
  return result;
}
