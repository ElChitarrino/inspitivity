import assert from "node:assert/strict";
import test from "node:test";
import { voiceProgression } from "../packages/music-theory/voicing.js";
import { voiceChord } from "../packages/music-theory/index.js";

test("generated harmony moves upper voices together and keeps its bass root", () => {
  const symbols=["Cmaj7","Am7","Dm7","G7"];
  const voiced=voiceProgression(symbols,52);
  assert.deepEqual(voiced,voiceProgression(symbols,52));
  assert.deepEqual(voiced.map(chord=>chord[0]),[36,45,38,43]);
  assert.ok(voiced.every(chord=>chord.length>=4&&chord.slice(1).every(pitch=>pitch>=48&&pitch<=76)));
  assert.ok(voiced.slice(1).every((chord,index)=>Math.abs(chord.at(-1)!-voiced[index].at(-1)!)<=12));
});

test("uncommon harmonies retain a playable voicing", () => {
  const voiced=voiceProgression(["Csus2","Bb13","F#m7b5"],17,"drop 2");
  assert.ok(voiced.every(chord=>chord.length>=3&&chord.every(Number.isInteger)));
});

test("connected voicings reduce average top-line jumps versus independent voicings", () => {
  const progressions=[["Cmaj7","Am7","Dm7","G7"],["Em7","Cmaj7","Am7","B7"],["Bb","Gm7","Eb","F7"]];
  const travel=(voicings:number[][])=>voicings.slice(1).reduce((sum,chord,index)=>sum+Math.abs(chord.at(-1)!-voicings[index].at(-1)!),0);
  const linked=progressions.reduce((sum,symbols)=>sum+travel(voiceProgression(symbols,42)),0);
  const independent=progressions.reduce((sum,symbols)=>sum+travel(symbols.map((symbol,index)=>voiceChord(symbol,42+index*997))),0);
  assert.ok(linked<independent,`linked ${linked} semitones vs independent ${independent}`);
});
