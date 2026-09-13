import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {playbackBeat,activeChordIndex} from "../packages/sequencing/playhead.js";

test("audio positions wrap accurately through normal, odd and compound phrases",()=>{
  assert.equal(playbackBeat(1.25,120,16),2.5);
  assert.equal(playbackBeat(17,120,7),6);
  assert.equal(playbackBeat(18,60,9),0);
  for(const length of [3,5,6,7,9,16])assert.equal(playbackBeat(length,60,length),0);
});
test("unchanged paused audio time gives unchanged indicators",()=>{
  const frozen=3.125;
  const before=playbackBeat(frozen,120,16);
  for(let i=0;i<100;i++)assert.equal(playbackBeat(frozen,120,16),before);
  assert.equal(playbackBeat(frozen+.25,120,16),before+.5);
  assert.equal(playbackBeat(0,120,16),0);
});
test("chord highlights follow edited lengths and clear outside the phrase",()=>{
  assert.equal(activeChordIndex([2,4,1],1.99),0);
  assert.equal(activeChordIndex([2,4,1],2),1);
  assert.equal(activeChordIndex([2,4,1],6),2);
  assert.equal(activeChordIndex([2,4,1],7),-1);
  assert.equal(playbackBeat(NaN,120,4),0);
});
test("section transport suspends the audio clock and retains a separate reset",()=>{
  const app=readFileSync("app/InspitivityApp.tsx","utf8");
  assert.match(app,/await engine.get\(\).suspend\(\)/);
  assert.match(app,/if\(pausedRef.current\)\{/);
  assert.match(app,/Stop and rewind current section/);
  assert.match(app,/Selected chord inspector/);
  assert.match(app,/chord.id!==selectedChord\?\.id\?null/);
  assert.match(app,/data-mobile-hidden=\{workspaceMode==="edit"&&selectedDrum!==instrument\}/);
});
