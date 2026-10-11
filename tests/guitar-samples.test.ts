import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { GUITAR_SAMPLE_ROOTS, guitarSampleRoot } from "../packages/sequencing/guitar-samples.js";

test("the licensed guitar bank contains every mapped note and a playable lower register", () => {
  const path="public/audio/classical-guitar/";
  const manifest=JSON.parse(readFileSync(`${path}manifest.json`,"utf8"));
  assert.deepEqual(manifest.roots,GUITAR_SAMPLE_ROOTS);
  assert.match(readFileSync(`${path}CREDITS.md`,"utf8"),/CC0 1\.0/);
  assert.ok(GUITAR_SAMPLE_ROOTS[0]<=40&&GUITAR_SAMPLE_ROOTS.at(-1)!>=84);
  for(const root of GUITAR_SAMPLE_ROOTS){
    const sample=readFileSync(`${path}${root}.mp3`);
    assert.ok(sample.length>4000,`${root} sample is truncated`);
    assert.ok(sample[0]===0xff||sample.toString("ascii",0,3)==="ID3",`${root} is not MP3`);
  }
  for(let pitch=40;pitch<=84;pitch++)assert.ok(Math.abs(pitch-guitarSampleRoot(pitch))<=2);
});
