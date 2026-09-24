import assert from "node:assert/strict";
import test from "node:test";
import { alignPhrase } from "../packages/workspace/sketch.js";

test("generated phrases stay within a complete harmonic cycle",()=>{
  const notes=[{start:.5,duration:.5,pitch:60},{start:2,duration:1,pitch:64},{start:5,duration:1,pitch:67}];
  const aligned=alignPhrase(notes,16);
  assert.ok(aligned.every(note=>note.start>=0&&note.start+note.duration<=16));
  assert.ok(Math.max(...aligned.map(note=>note.start+note.duration))>=15);
  assert.deepEqual(aligned.map(note=>note.pitch),[60,64,67]);
});
