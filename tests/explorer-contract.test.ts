import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("explorer is independent of projects and absent from all creation choices",async()=>{
  const source=await readFile("app/InspitivityApp.tsx","utf8");
  const nav=source.slice(source.indexOf("function BottomNav("),source.indexOf("type SharedAudioGraph"));
  assert.ok(nav.indexOf('"Projects"')<nav.indexOf('"Chord explorer"'));
  assert.ok(nav.indexOf('"Chord explorer"')<nav.indexOf('"Metronome"'));
  assert.doesNotMatch(nav,/aria-label="Capture"/);
  const modal=source.slice(source.indexOf("function CreateModal("));
  assert.doesNotMatch(modal,/choose\("explorer"\)/);
  const explorer=source.slice(source.indexOf("function ChordExplorer("),source.indexOf("function SoloPreview("));
  assert.doesNotMatch(explorer,/ProjectContext|saveIdea|useDraftPreview|useDraftState|project:/);
  assert.match(explorer,/label="Key"/);assert.match(explorer,/label="Mode"/);
  assert.match(explorer,/setTimeout\(\(\)=>generateRef.current\(\),700\)/);
  assert.doesNotMatch(explorer,/disabled=\{.*[Bb]usy/);
});

test("worker build is isolated from DOM transforms and shipped by production build",async()=>{
  const script=await readFile("scripts/build-theme-worker.mjs","utf8");
  const hook=await readFile("app/use-theme-ai.ts","utf8");
  const pkg=JSON.parse(await readFile("package.json","utf8"));
  assert.match(script,/configFile:false/);
  assert.match(script,/app\/theme-model.worker.ts/);
  assert.match(hook,/new Worker\("\/local-ai\/theme-model.js"/);
  assert.match(pkg.scripts.build,/build-theme-worker/);
  assert.match(pkg.scripts.predev,/build-theme-worker/);
});
