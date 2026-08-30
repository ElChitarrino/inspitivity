import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const source = await readFile(resolve(process.cwd(), "app/InspitivityApp.tsx"), "utf8");

test("the product surface retains all five planned workflows", () => {
  for (const feature of ["Projects", "Quick Record", "Chord Progression", "Melody Generator", "Metronome"]) assert.match(source, new RegExp(feature));
});

test("projects and audio are stored locally without requiring an account", () => {
  assert.match(source, /localStorage\.setItem\("inspitivity-projects"/);
  assert.match(source, /indexedDB\.open\("inspitivity-audio"/);
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
});

test("arrangements expose section creation, ordering, and idea saving", () => {
  assert.match(source, /\+ Add section/);
  assert.match(source, /aria-label="Move up"/);
  assert.match(source, /aria-label="Move down"/);
  assert.match(source, /Save idea/);
});

test("both generators expose accessible play and loop controls", () => {
  assert.match(source, /Loop progression/);
  assert.match(source, /Loop melody/);
  assert.match(source, /aria-pressed=\{transport\.mode === "loop"\}/);
});

test("project tempo and key are shared by every musical tool", () => {
  assert.match(source, /function ProjectContext/);
  assert.match(source, /bpm: clampBpm/);
  assert.match(source, /key: formatProjectKey/);
  assert.match(source, /<ProjectContext project=\{project\} update=\{updateProject\}/);
});

test("chord progressions support whole-note playback and direct editing", () => {
  assert.match(source, /beats: 4/);
  assert.match(source, /aria-label=\{`Chord \$\{index \+ 1\}`\}/);
  assert.match(source, /Add chord/);
  assert.match(source, /Remove chord/);
  assert.doesNotMatch(source, /Audio-clock scheduling keeps every click tight/);
});
