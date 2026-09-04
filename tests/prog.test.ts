import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHarmonyColour,
  classifyTension,
  generateProgRiff,
  meterMapTotal,
  nextProgMeter,
  transformMotif,
} from "../packages/prog/index.js";

test("prog meter maps calculate evolving bar lengths and cycle through odd signatures", () => {
  assert.equal(meterMapTotal(["7/8", "9/8", "4/4"]), 20);
  assert.equal(nextProgMeter("7/8"), "9/8");
});

test("riff generator is deterministic and contains displaced accent data", () => {
  const options = {
    root: "E" as const,
    mode: "phrygian" as const,
    beats: 7,
    cycle: 5,
    grouping: "3+2+2",
    density: 0.7,
    seed: 14,
  };
  const riff = generateProgRiff(options);
  assert.deepEqual(riff, generateProgRiff(options));
  assert.ok(riff.length > 0);
  assert.ok(riff.some((note) => note.accent));
  assert.ok(riff.every((note) => note.start >= 0 && note.start < 7));
  assert.ok(riff[0].start > 0, "guide pattern should enter after beat one");
  assert.notEqual(riff[0].pitch % 12, 4, "guide pattern should not open on the root");
});

test("advanced harmony, motif transformations, and tension guidance provide prog writing tools", () => {
  assert.equal(applyHarmonyColour("Em9", "E", "pedal point", 1), "Em9/E");
  assert.match(applyHarmonyColour("Em9", "E", "quartal", 0), /4th$/);
  const phrase = [
    { pitch: 60, start: 0, duration: 1 },
    { pitch: 64, start: 1, duration: 0.5 },
  ];
  assert.deepEqual(
    transformMotif(phrase, "retrograde").map((note) => note.start),
    [0, 0.5],
  );
  assert.equal(classifyTension(64, "Cmaj7"), "chord tone");
  assert.equal(classifyTension(62, "Cmaj7"), "colour tension");
});
