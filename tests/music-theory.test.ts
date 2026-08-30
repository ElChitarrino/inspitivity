import assert from "node:assert/strict";
import test from "node:test";
import { generateChordProgression, generateMelody, getScale, notePitchClass, type MelodyMood, type Mode, type Root } from "../packages/music-theory/index.js";

test("scale engine returns the correct notes for major and modal scales", () => {
  assert.deepEqual(getScale("C", "major"), ["C", "D", "E", "F", "G", "A", "B"]);
  assert.deepEqual(getScale("A", "dorian"), ["A", "B", "C", "D", "E", "F#", "G"]);
  assert.deepEqual(getScale("E", "minor pentatonic"), ["E", "G", "A", "B", "D"]);
  assert.deepEqual(getScale("Eb", "major"), ["Eb", "F", "G", "Ab", "Bb", "C", "D"]);
  assert.deepEqual(getScale("C#", "major"), ["C#", "D#", "E#", "F#", "G#", "A#", "B#"]);
  assert.equal(notePitchClass("Ebm9"), 3);
});

test("chord generation respects length, scale, seed, and complexity", () => {
  const simple = generateChordProgression({ root: "A", mode: "dorian", bars: 8, complexity: "simple", seed: 4 });
  const medium = generateChordProgression({ root: "A", mode: "dorian", bars: 8, complexity: "medium", seed: 4 });
  assert.equal(simple.length, 8);
  assert.deepEqual(simple, generateChordProgression({ root: "A", mode: "dorian", bars: 8, complexity: "simple", seed: 4 }));
  assert.ok(simple.every(chord => getScale("A", "dorian").includes(chord.name.replace(/m|dim|°|\d+/g, "") as Root)));
  assert.ok(simple.every(chord => !/7|9|11|13/.test(chord.name)));
  assert.ok(medium.every(chord => /7/.test(chord.name)));
});

test("melodies are deterministic for a seed and valid for their requested scale and range", () => {
  const options = { root: "E" as Root, mode: "dorian" as Mode, range: [3, 5] as [number, number], mood: "calm" as MelodyMood, density: .6, seed: 42 };
  const first = generateMelody(options);
  const second = generateMelody(options);
  const pitchClasses = new Set(getScale("E", "dorian").map(note => notePitchClass(note)));
  assert.deepEqual(first, second);
  assert.equal(first.length, 16);
  assert.ok(first.every(note => note.pitch >= 48 && note.pitch <= 83));
  assert.ok(first.every(note => pitchClasses.has(note.pitch % 12)));
  assert.equal(first.at(-1)!.pitch % 12, 4, "phrase should resolve to E");
  assert.ok(first.every((note, index) => index === 0 || note.start > first[index - 1].start));
});

test("regeneration produces meaningfully different melodic contours", () => {
  const signatures = new Set(Array.from({ length: 40 }, (_, seed) => {
    const melody = generateMelody({ root: "E", mode: "dorian", mood: "calm", density: .6, seed });
    return melody.map((note, index) => index === 0 ? 0 : note.pitch - melody[index - 1].pitch).join(",");
  }));
  assert.ok(signatures.size >= 30, `expected at least 30 distinct contours, received ${signatures.size}`);
});

test("mood and density materially change the generated phrase", () => {
  const moods: MelodyMood[] = ["calm", "bright", "melancholic", "dark"];
  const moodSignatures = new Set(moods.map(mood => generateMelody({ root: "E", mode: "dorian", mood, density: .6, seed: 19 }).map(note => `${note.pitch}:${note.duration}`).join("|")));
  const sparse = generateMelody({ root: "E", mode: "dorian", mood: "calm", density: .2, seed: 21 });
  const dense = generateMelody({ root: "E", mode: "dorian", mood: "calm", density: 1, seed: 21 });
  const end = (melody: ReturnType<typeof generateMelody>) => melody.at(-1)!.start + melody.at(-1)!.duration;
  assert.equal(moodSignatures.size, moods.length);
  assert.ok(end(dense) < end(sparse), "higher density should create a faster-moving phrase");
});

test("melodic movement remains singable and resolves after motif variation", () => {
  for (let seed = 1; seed <= 24; seed++) {
    const melody = generateMelody({ root: "A", mode: "minor", mood: "bright", density: .7, seed });
    const leaps = melody.slice(1).map((note, index) => Math.abs(note.pitch - melody[index].pitch));
    assert.ok(Math.max(...leaps) <= 12, `seed ${seed} produced a leap larger than an octave`);
    assert.equal(melody.at(-1)!.pitch % 12, 9);
  }
});
