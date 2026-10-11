import {
  chordIntervals,
  getScale,
  notePitchClass,
  SCALE_MODES,
  type Mode,
  type Root,
} from "../music-theory/index.js";
import { decodeRhythmicChord } from "../music-theory/chord-rhythm.js";
import type { Project, SongSection } from "./index.js";
import { pitchClass } from "./idea-codecs.js";

const ROOT_NAMES: readonly Root[] = [
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

export function projectHarmony(project: Project) {
  const [savedRoot, ...modeWords] = project.key.trim().split(/\s+/);
  const rootIndex = notePitchClass(savedRoot);
  const root = rootIndex === null ? "C" : ROOT_NAMES[rootIndex];
  const savedMode = modeWords.join(" ").toLowerCase();
  const mode: Mode = SCALE_MODES.includes(savedMode as Mode) ? (savedMode as Mode) : "ionian";
  return { root, mode };
}

export function sectionBarLengths(project: Project, section: SongSection): number[] {
  return Array.from({ length: section.bars }, (_, index) => {
    const meter = section.meterMap?.length
      ? section.meterMap[index % section.meterMap.length]
      : project.meter;
    return Number(meter.split("/")[0]) || 4;
  });
}

export function sectionContext(project: Project, section: SongSection) {
  const { root, mode } = projectHarmony(project);
  const barLengths = sectionBarLengths(project, section);
  const length = barLengths.reduce((sum, beats) => sum + beats, 0);
  const scale = getScale(root, mode)
    .map(notePitchClass)
    .filter((pitch): pitch is number => pitch !== null);
  return { root, mode, barLengths, length, scale };
}

/** Decode once per transformation, then resolve notes against a repeated chord cycle. */
export function harmonyTimeline(data: string[]) {
  const chords = data.map(decodeRhythmicChord);
  const cycle = chords.reduce((sum, chord) => sum + chord.beats, 0);

  function chordAt(beat: number) {
    if (!cycle || !Number.isFinite(beat)) return undefined;
    let position = ((beat % cycle) + cycle) % cycle;
    for (const chord of chords) {
      if (position < chord.beats) return chord;
      position -= chord.beats;
    }
    return undefined;
  }

  function fitPitch(pitch: number, beat: number, force = false) {
    const chord = chordAt(beat);
    const root = chord ? notePitchClass(chord.name) : null;
    const strongBeat = Math.abs(beat - Math.round(beat)) <= 0.08;
    if (root === null || !chord || (!force && !strongBeat)) return pitch;
    const tones = chordIntervals(chord.name).map((interval) => (root + interval) % 12);
    const candidates = Array.from({ length: 25 }, (_, index) => pitch + index - 12);
    return (
      candidates
        .filter((candidate) => tones.includes(pitchClass(candidate)))
        .sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch))[0] ?? pitch
    );
  }

  return { chordAt, fitPitch };
}
