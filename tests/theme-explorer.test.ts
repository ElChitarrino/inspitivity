import assert from "node:assert/strict";
import test from "node:test";
import { chordIntervals, generateChordProgression, getScale, notePitchClass } from "../packages/music-theory/index.js";
import { inferThemeFeel, parseModelFeel, THEME_FEELS, THEME_RECIPES } from "../packages/workspace/theme-explorer.js";

test("semantic scenes choose distinguishable musical directions, including German", () => {
  assert.equal(inferThemeFeel("nostalgic train ride"), "wistful");
  assert.equal(inferThemeFeel("djent metal and angry riffs"), "dark");
  assert.equal(inferThemeFeel("warme und ruhige Sommernacht"), "warm");
  assert.equal(inferThemeFeel("neo-soul after midnight"), "soulful");
  assert.equal(parseModelFeel("soulful"), "soulful");
  assert.equal(parseModelFeel("feel: dark"), "dark");
  assert.equal(parseModelFeel("warm, wistful, bright, restless, soulful, dark"), null);
});

test("every theme recipe yields a coherent four-chord phrase in major and minor", () => {
  for (const feel of THEME_FEELS) {
    const recipe = THEME_RECIPES[feel];
    assert.equal(recipe.degrees.length, 4);
    for (const mode of ["ionian", "aeolian"] as const) {
      const scale = new Set(getScale("C", mode).map(notePitchClass));
      const chords = generateChordProgression({root:"C", mode, bars:4, complexity:recipe.complexity, tension:recipe.tension, opening:recipe.opening, degreePattern:recipe.degrees, seed:22});
      assert.equal(chords.length, 4);
      assert.ok(chords.every(chord => chordIntervals(chord.name).every(interval => scale.has((chord.pitch+interval)%12))), `${feel} ${mode}`);
    }
  }
});
