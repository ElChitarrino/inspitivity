import {
  decodeRhythmicChord,
  encodeChordAttacks,
  type RhythmicChord,
} from "../music-theory/chord-rhythm.js";
import type { BassEvent } from "./bass.js";
import type { Idea } from "./index.js";

export type PitchedIdeaType = "bass" | "melody" | "riff";
export type EncodedNote = { pitch: number; start: number; duration: number; fields: string[] };
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function pitchClass(pitch: number) {
  return ((pitch % 12) + 12) % 12;
}

export function midiNoteName(pitch: number) {
  return `${NOTE_NAMES[pitchClass(pitch)]}${Math.floor(pitch / 12) - 1}`;
}

export function readHarmonyData(idea?: Idea): string[] {
  if (idea?.data?.length) return idea.data;
  return idea?.detail ? idea.detail.split(" · ") : [];
}

export function encodeChord(chord: RhythmicChord): string {
  return `${chord.name}|${chord.beats}|${chord.pitches?.join(",") ?? ""}|${encodeChordAttacks(chord.attacks)}`;
}

export function decodeHarmony(idea?: Idea) {
  return readHarmonyData(idea).map(decodeRhythmicChord);
}

/** Melody stores a note label before timing; bass/riff store MIDI pitch first. */
export function decodePitchedNotes(idea: Idea): EncodedNote[] {
  const pitchField = idea.type === "melody" ? 3 : 0;
  return (idea.data ?? [])
    .map((encoded) => {
      const fields = encoded.split("|");
      return {
        fields,
        pitch: Number(fields[pitchField]),
        start: Number(fields[1]),
        duration: Number(fields[2]),
      };
    })
    .filter(
      (note) =>
        note.fields[pitchField]?.trim() !== "" &&
        note.fields[1]?.trim() !== "" &&
        note.fields[2]?.trim() !== "" &&
        Number.isFinite(note.pitch) &&
        note.pitch >= 0 &&
        note.pitch <= 127 &&
        Number.isFinite(note.start) &&
        note.start >= 0 &&
        Number.isFinite(note.duration) &&
        note.duration > 0,
    );
}

/** Preserve accent/mute fields and any future metadata while replacing pitch/timing. */
export function encodePitchedNote(type: Idea["type"], note: EncodedNote): string {
  const fields = [...note.fields];
  fields[type === "melody" ? 3 : 0] = String(note.pitch);
  if (type === "melody") fields[0] = midiNoteName(note.pitch);
  fields[1] = String(note.start);
  fields[2] = String(note.duration);
  return fields.join("|");
}

export function encodeBassNote(note: BassEvent): string {
  return `${note.pitch}|${note.start}|${note.duration}|${note.accent ? 1 : 0}`;
}
