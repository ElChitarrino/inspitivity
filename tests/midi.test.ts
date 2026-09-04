import assert from "node:assert/strict";
import test from "node:test";
import { createMidiFile, variableLength } from "../packages/midi/index.js";

test("MIDI export writes a standard single-track file with timed notes", () => {
  const file = createMidiFile({
    name: "Guide pattern",
    bpm: 124,
    meter: "7/8",
    program: 80,
    notes: [
      { pitch: 64, start: 0.5, duration: 0.5, velocity: 0.8 },
      { pitch: 67, start: 1.5, duration: 0.5, velocity: 0.7 },
    ],
  });
  assert.equal(new TextDecoder().decode(file.slice(0, 4)), "MThd");
  assert.ok(new TextDecoder().decode(file).includes("MTrk"));
  assert.ok(file.includes(0x90), "contains a note-on event");
  assert.ok(file.includes(0x58), "contains a time-signature event");
});

test("variable-length MIDI quantities encode boundary values", () => {
  assert.deepEqual(variableLength(0), [0]);
  assert.deepEqual(variableLength(127), [127]);
  assert.deepEqual(variableLength(128), [0x81, 0]);
  assert.deepEqual(variableLength(480), [0x83, 0x60]);
});
