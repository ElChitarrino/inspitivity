import assert from "node:assert/strict";
import test from "node:test";
import { beatDurationSeconds, calculateTapTempo, isAccentedStep, melodyLoopDurationMs, progressionLoopDurationMs, subdivisionDurationSeconds } from "../packages/sequencing/index.js";

test("tempo and subdivision timing are musically correct", () => {
  assert.equal(beatDurationSeconds(120), .5);
  assert.equal(subdivisionDurationSeconds(120, 2), .25);
  assert.throws(() => beatDurationSeconds(0), RangeError);
  assert.throws(() => subdivisionDurationSeconds(120, 0), RangeError);
});

test("progression and melody loop boundaries match their musical duration", () => {
  assert.equal(progressionLoopDurationMs(4, 120), 2000);
  assert.equal(melodyLoopDurationMs([{ start: 0, duration: .5 }, { start: 3.5, duration: .5 }], 120), 2000);
  assert.equal(melodyLoopDurationMs([], 120), 0);
});

test("tap tempo uses recent intervals and rejects an obvious accidental tap", () => {
  assert.equal(calculateTapTempo([0]), null);
  assert.equal(calculateTapTempo([0, 500, 1000, 1500]), 120);
  assert.equal(calculateTapTempo([0, 500, 520, 1020, 1520]), 120);
});

test("metronome accents only the first subdivision of each bar", () => {
  const accents = Array.from({ length: 16 }, (_, step) => isAccentedStep(step, 4, 2));
  assert.deepEqual(accents.map((accent, index) => accent ? index : -1).filter(index => index >= 0), [0, 8]);
});
