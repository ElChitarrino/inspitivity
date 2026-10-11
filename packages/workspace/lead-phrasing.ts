export type PhraseNote = { pitch: number; start: number; duration: number; velocity: number };

/** Two-bar question/answer phrases with space at their ends, not a constant stream. */
export function phraseLead<T extends PhraseNote>(
  notes: readonly T[],
  beatsPerBar: number,
  length: number,
): T[] {
  const phraseLength = beatsPerBar * 2;
  const rest = Math.min(1, beatsPerBar * 0.25);
  const sorted = notes.map((note) => ({ ...note })).sort((a, b) => a.start - b.start);
  return sorted.flatMap((note, index) => {
    const boundary = Math.min(length, (Math.floor(note.start / phraseLength) + 1) * phraseLength);
    const end = boundary - rest;
    if (note.start >= end || note.start < 0 || note.start >= length) return [];
    const next = sorted[index + 1]?.start ?? length;
    const duration = Math.min(
      note.duration,
      end - note.start,
      Math.max(0, next - note.start - 0.035),
    );
    if (duration < 0.08) return [];
    const downbeat =
      Math.abs(note.start / beatsPerBar - Math.round(note.start / beatsPerBar)) < 0.02;
    const velocity = Math.max(0.35, Math.min(0.85, note.velocity * (downbeat ? 1.04 : 0.94)));
    return [{ ...note, duration, velocity }];
  });
}
