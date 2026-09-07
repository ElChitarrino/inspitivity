import assert from "node:assert/strict";
import test from "node:test";
import { voiceChord, decodeVoicing, chordIntervals, generateChordProgression, generateMelody, getScale, notePitchClass, type MelodyMood, type Mode, type Root } from "../packages/music-theory/index.js";

test("scale engine returns the correct notes for major and modal scales", () => {
  assert.deepEqual(getScale("C", "major"), ["C", "D", "E", "F", "G", "A", "B"]);
  assert.deepEqual(getScale("A", "dorian"), ["A", "B", "C", "D", "E", "Gb", "G"]);
  assert.deepEqual(getScale("E", "minor pentatonic"), ["E", "G", "A", "B", "D"]);
  assert.deepEqual(getScale("Eb", "major"), ["Eb", "F", "G", "Ab", "Bb", "C", "D"]);
  assert.deepEqual(getScale("Db", "major"), ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"]);
  assert.equal(notePitchClass("Ebm9"), 3);
});

test("extended chord voicings include every named chord quality", () => {
  assert.deepEqual(chordIntervals("Em9"), [0, 3, 7, 10, 14]);
  assert.deepEqual(chordIntervals("Emaj9"), [0, 4, 7, 11, 14]);
  assert.deepEqual(chordIntervals("C#dim7"), [0, 3, 6, 9]);
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

test("chord progressions use varied openings and expose each chord's scale degree", () => {
  const openings = new Set(Array.from({ length: 12 }, (_, seed) => generateChordProgression({ root: "C", mode: "major", bars: 4, complexity: "medium", seed })[0].roman));
  assert.ok(openings.size >= 4, `expected a curated set of opening roles, received ${[...openings].join(", ")}`);
  assert.ok(Array.from({ length: 12 }, (_, seed) => generateChordProgression({ root: "C", mode: "major", bars: 4, complexity: "medium", seed })[0].roman).every(roman => roman !== "I"));
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

test("phrase shapes produce distinct rhythms and repeating hooks keep their pulse", () => {
  const options = { root: "E" as Root, mode: "dorian" as Mode, notes: 16, seed: 7 };
  const hook = generateMelody({ ...options, shape: "hook" });
  const floating = generateMelody({ ...options, shape: "floating" });
  const answer = generateMelody({ ...options, shape: "answer" });
  const rhythm = (notes: typeof hook) => notes.slice(1).map((note, i) => note.start - notes[i].start);
  assert.deepEqual(rhythm(hook).slice(0, 4), rhythm(hook).slice(4, 8));
  assert.notDeepEqual(rhythm(hook), rhythm(answer));
  assert.ok(floating.at(-1)!.start > hook.at(-1)!.start);
  for (const melody of [hook, floating, answer]) {
    assert.deepEqual(melody.length, 16);
    assert.ok(melody[0].start > 0);
    assert.ok(melody.every(note => getScale("E", "dorian").some(name => notePitchClass(name) === note.pitch % 12)));
    assert.equal(melody.at(-1)!.pitch % 12, 4);
  }
});


test("four-chord templates offer at least eight different progressions per opening", () => {
  for (const opening of ["away", "tonic", "surprise"] as const) {
    const choices = new Set(Array.from({length:24}, (_,seed) => generateChordProgression({ root:"E", mode:"minor", bars:4, complexity:"medium", opening, seed }).map(c=>c.name).join("|")));
    assert.ok(choices.size >= 8, opening);
  }
});

test("harmonic generation composes many distinct paths under unchanged settings", () => {
  const progressions=Array.from({length:128},(_,seed)=>generateChordProgression({root:"E",mode:"minor",bars:4,complexity:"medium",seed}));
  assert.ok(new Set(progressions.map(p=>p.map(c=>c.name).join("|"))).size>=90);
  assert.ok(progressions.every(p=>p.length===4 && new Set(p.map(c=>c.degree)).size>=3));
});

test("each melodic shape changes pitches and onsets across generations", () => {
  for(const shape of ["flow","hook","answer","floating"] as const) {
    const signatures=Array.from({length:64},(_,seed)=>generateMelody({root:"E",mode:"minor",notes:16,seed,shape}).map(n=>`${n.pitch}:${n.start}`).join("|"));
    assert.ok(new Set(signatures).size>=55,shape);
  }
});


test("voicings vary inversion and spread while retaining chord tones",()=>{
  const options=Array.from({length:128},(_,seed)=>voiceChord("Em9",seed));
  assert.ok(new Set(options.map(p=>p.join(","))).size>=12);
  for(const pitches of options) {
    assert.ok(pitches.every(p=>p>=24&&p<=96&&[4,7,11,2,6].includes(p%12)));
    assert.deepEqual(decodeVoicing("Em9",pitches.join(",")),pitches);
    assert.equal(new Set(pitches).size,pitches.length);
  }
  assert.ok(decodeVoicing("Cmaj7","999,NaN").every(p=>p>=24&&p<=96));
});
