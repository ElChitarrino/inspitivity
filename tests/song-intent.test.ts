import test from "node:test";
import assert from "node:assert/strict";
import { interpretSongBrief } from "../packages/workspace/song-brief.js";
import { phraseLead } from "../packages/workspace/lead-phrasing.js";
import {
  INSTRUMENT_CHARACTERS,
  characterPeakGain,
  instrumentEnvelope,
} from "../packages/sequencing/instrument-voices.js";
import { buildSongPlan } from "../packages/workspace/music.js";
import type { Project } from "../packages/workspace/index.js";

test("a progressive fusion brief maps explicit musical intent without inventing settings", () => {
  const intent = interpretSongBrief(
    "Hopeful progressive fusion, D dorian, 110 BPM, 7/8, backing track without melody",
  );
  assert.equal(intent.style, "prog");
  assert.equal(intent.direction, "hopeful");
  assert.equal(intent.root, "D");
  assert.equal(intent.mode, "dorian");
  assert.equal(intent.bpm, 110);
  assert.equal(intent.meter, "7/8");
  assert.equal(intent.includeMelody, false);
  assert.equal(intent.intensity, undefined);
  assert.deepEqual(interpretSongBrief("the street where we grew up"), {
    style: undefined,
    recognized: [],
  });
});
test("German cues, enharmonic keys, and explicit exclusions survive interpretation", () => {
  const intent = interpretSongBrief(
    "Sanft und traurig, Ab Moll, 90 bpm, 4/4, ohne Melodie, ohne Pattern",
  );
  assert.equal(intent.direction, "mellow");
  assert.equal(intent.intensity, "mellow");
  assert.equal(intent.root, "Ab");
  assert.equal(intent.mode, "aeolian");
  assert.equal(intent.includeMelody, false);
  assert.equal(intent.includePattern, false);
  const negative = interpretSongBrief("hopeful, not heavy, no pattern");
  assert.equal(negative.intensity, undefined);
  assert.equal(negative.style, undefined);
  assert.equal(negative.includePattern, false);
  assert.equal(interpretSongBrief("C# minor").root, "Db");
  assert.equal(interpretSongBrief("999 bpm 99/8").bpm, undefined);
  assert.equal(interpretSongBrief("999 bpm 99/8").meter, undefined);
});
test("lead phrases preserve pitch ideas, leave phrase-end rests and prevent overlapping attacks", () => {
  for (const beats of [4, 7, 6]) {
    const length = beats * 4;
    const source = Array.from({ length: Math.ceil(length) }, (_, i) => ({
      pitch: 60 + (i % 5),
      start: i,
      duration: 3,
      velocity: 0.7,
    }));
    const snapshot = JSON.stringify(source),
      phrased = phraseLead(source, beats, length);
    assert.ok(phrased.length > 0);
    assert.equal(JSON.stringify(source), snapshot);
    for (let i = 0; i < phrased.length; i++) {
      const note = phrased[i],
        end =
          Math.min(length, (Math.floor(note.start / (beats * 2)) + 1) * beats * 2) -
          Math.min(1, beats * 0.25);
      assert.ok(note.start + note.duration <= end + 1e-9);
      assert.ok(note.duration > 0);
      assert.ok(!phrased[i + 1] || note.start + note.duration < phrased[i + 1].start);
      assert.equal(note.pitch, source.find((original) => original.start === note.start)!.pitch);
    }
  }
});
test("synthetic partial gain is bounded and short pad notes do not leave long overlapping tails", () => {
  for (const character of Object.values(INSTRUMENT_CHARACTERS)) {
    const sum = character.partials.reduce((total, partial) => total + Math.abs(partial.level), 0);
    assert.ok(characterPeakGain(character, 0.07) * sum <= 0.07);
    const short = instrumentEnvelope(character, 0.1, 1),
      long = instrumentEnvelope(character, 2, 1);
    assert.ok(short.end - short.hold <= 0.06 + 1e-9);
    assert.ok(long.end >= short.end);
  }
});
test("saved lead dynamics reach the song plan while old four-field melodies retain their level", () => {
  const project: Project = {
    id: "p",
    name: "Intent",
    bpm: 100,
    meter: "4/4",
    key: "C ionian",
    updated: 0,
    sections: [
      {
        id: "s",
        name: "Theme",
        bars: 1,
        color: "mint",
        ideas: [
          {
            id: "m",
            type: "melody",
            name: "Lead",
            detail: "",
            cycleBeats: 4,
            data: ["C4|0|.5|60|.4", "E4|1|.5|64|.8", "G4|2|.5|67"],
          },
        ],
      },
    ],
  };
  const notes = buildSongPlan(project).events;
  assert.equal(notes.length, 3);
  assert.ok(notes[0].velocity < notes[1].velocity);
  assert.equal(notes[2].velocity, 0.7);
});
