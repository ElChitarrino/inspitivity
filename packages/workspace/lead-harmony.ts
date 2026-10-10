import { chordIntervals, notePitchClass } from "../music-theory/index.js";
import type { RhythmicChord } from "../music-theory/chord-rhythm.js";
import { midiNoteName } from "./idea-codecs.js";

export function fitMelodyToChords<
  T extends {
    pitch: number;
    note: string;
    start: number;
    duration: number;
    velocity: number;
  },
>(melody: T[], chords: RhythmicChord[]) {
  const totalBeats = chords.reduce((sum, chord) => sum + chord.beats, 0);
  if (!totalBeats || !chords.length) return melody;
  return melody.map((note) => {
    const beat = ((note.start % totalBeats) + totalBeats) % totalBeats;
    const onStrongBeat = Math.abs(beat - Math.round(beat)) < 0.08;
    let cursor = 0;
    let chordStart = 0;
    const chord =
      chords.find((item) => {
        chordStart = cursor;
        cursor += item.beats;
        return beat < cursor;
      }) ?? chords[chords.length - 1];
    const rootPitch = notePitchClass(chord.name);
    if (rootPitch === null) return note;
    const intervals = chordIntervals(chord.name);
    const pitchClasses = new Set(intervals.map((interval) => (rootPitch + interval) % 12));
    const relativePitch = (((note.pitch - rootPitch) % 12) + 12) % 12;
    const sustainedDissonance = note.duration >= 0.75 && [1, 6, 11].includes(relativePitch);
    if (!onStrongBeat && !sustainedDissonance) return note;
    if (pitchClasses.has(((note.pitch % 12) + 12) % 12)) return note;
    const atChordChange = Math.abs(beat - chordStart) < 0.08;
    const candidates = Array.from({ length: 25 }, (_, index) => note.pitch + index - 12).filter(
      (pitch) => pitchClasses.has(((pitch % 12) + 12) % 12),
    );
    const fittedPitch =
      candidates.sort((a, b) => {
        const score = (pitch: number) =>
          Math.abs(pitch - note.pitch) + (!atChordChange && pitch % 12 === rootPitch ? 1.5 : 0);
        return score(a) - score(b);
      })[0] ?? note.pitch;
    return { ...note, pitch: fittedPitch, note: midiNoteName(fittedPitch) };
  });
}
