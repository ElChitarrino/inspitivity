import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePitchedNotes,
  encodePitchedNote,
  readHarmonyData,
} from "../packages/workspace/idea-codecs.js";
import {
  harmonyTimeline,
  projectHarmony,
  sectionBarLengths,
} from "../packages/workspace/section-context.js";
import { sectionMix, automaticSectionMix } from "../packages/workspace/section-mix.js";
import { developSection, varySection } from "../packages/workspace/section-development.js";
import { buildSongPlan } from "../packages/workspace/music.js";
import type { Project, SongSection, Idea } from "../packages/workspace/index.js";

const section: SongSection = { id: "s", name: "Theme", bars: 4, color: "mint", ideas: [] };
const project: Project = {
  id: "p",
  name: "Sketch",
  bpm: 100,
  meter: "4/4",
  key: "C ionian",
  updated: 0,
  sections: [section],
};

test("note codecs preserve accent, mute and extension fields for every pitched layer", () => {
  for (const type of ["melody", "bass", "riff"] as const) {
    const data = type === "melody" ? "C4|0|1|60|extension" : "60|0|1|1|0|extension";
    const idea: Idea = { id: type, type, name: "Part", detail: "", data: [data] };
    const note = decodePitchedNotes(idea)[0];
    const encoded = encodePitchedNote(type, { ...note, pitch: 63, start: 2, duration: 0.5 });
    assert.equal(encoded.split("|").at(-1), "extension");
    assert.deepEqual(
      decodePitchedNotes({ ...idea, data: [encoded] }).map(({ pitch, start, duration }) => ({
        pitch,
        start,
        duration,
      })),
      [{ pitch: 63, start: 2, duration: 0.5 }],
    );
    assert.equal(idea.data![0], data);
    if (type === "riff") assert.deepEqual(encoded.split("|").slice(3, 5), ["1", "0"]);
    if (type === "melody") assert.ok(encoded.startsWith("Eb4|"));
  }
});

test("malformed pitched notes are discarded rather than reaching playback as NaN", () => {
  const idea: Idea = {
    id: "b",
    type: "bass",
    name: "Bass",
    detail: "",
    data: ["60|0|1", "bad|0|1", "60|-1|1", "60|0|0", "128|0|1", "60|Infinity|1", "60|0|NaN"],
  };
  assert.equal(decodePitchedNotes(idea).length, 1);
});

test("legacy harmony details remain readable when no encoded data exists", () => {
  assert.deepEqual(
    readHarmonyData({ id: "c", type: "chords", name: "Chords", detail: "C · Am", data: [] }),
    ["C", "Am"],
  );
});

test("sharp imported keys normalize enharmonically and unsupported modes fall back", () => {
  assert.deepEqual(projectHarmony({ ...project, key: " G#   AEOLIAN " }), {
    root: "Ab",
    mode: "aeolian",
  });
  assert.deepEqual(projectHarmony({ ...project, key: "nonsense impossible" }), {
    root: "C",
    mode: "ionian",
  });
});

test("empty meter maps use project meter; mixed meter maps repeat by bar", () => {
  assert.deepEqual(
    sectionBarLengths({ ...project, meter: "7/8" }, { ...section, meterMap: [] }),
    [7, 7, 7, 7],
  );
  assert.deepEqual(
    sectionBarLengths(project, { ...section, meterMap: ["3/4", "5/4"] }),
    [3, 5, 3, 5],
  );
});

test("harmony lookup wraps its cycle and refits strong beats without changing passing tones", () => {
  const timeline = harmonyTimeline(["C|4", "F|4"]);
  assert.equal(timeline.chordAt(8)?.name, "C");
  assert.equal(timeline.chordAt(-1)?.name, "F");
  assert.equal(timeline.chordAt(NaN), undefined);
  assert.equal(timeline.fitPitch(61, 0), 60);
  assert.equal(timeline.fitPitch(61, 0.5), 61);
  assert.equal(timeline.fitPitch(61, 0.5, true), 60);
  assert.equal(harmonyTimeline([]).fitPitch(61, 0), 61);
});

test("mixes are independent snapshots and preserve saved channel settings", () => {
  const saved = { ...section, mix: { bass: { volume: 0.3, muted: true, solo: false } } };
  const mix = sectionMix(saved);
  assert.deepEqual(mix.bass, saved.mix.bass);
  mix.bass.volume = 0.9;
  mix.drums.volume = 0;
  assert.equal(saved.mix.bass.volume, 0.3);
  assert.equal(sectionMix().drums.volume, 0.82);
});

test("automatic balance responds to energy and leaves project and saved mix untouched", () => {
  const saved = { ...section, mix: { bass: { volume: 0.3, muted: true, solo: false } } };
  const before = JSON.stringify(saved);
  assert.ok(
    automaticSectionMix({ ...saved, energy: "powerful" }).drums.volume >
      automaticSectionMix({ ...saved, energy: "sparse" }).drums.volume,
  );
  const balanced = automaticSectionMix(saved, project);
  assert.ok(
    Object.values(balanced).every(
      (channel) => Number.isFinite(channel.volume) && channel.volume >= 0 && channel.volume <= 1,
    ),
  );
  assert.equal(JSON.stringify(saved), before);
});

test("development tolerates empty drum placeholders, sharp keys and empty meter maps", () => {
  const source = {
    ...section,
    meterMap: [],
    ideas: [{ id: "empty", type: "drums" as const, name: "Empty", detail: "", data: [] }],
  };
  const context = { ...project, key: "G# aeolian", sections: [source] };
  const before = JSON.stringify(context);
  let id = 0;
  const result = developSection(context, source, "chorus", 93, () => `generated-${id++}`);
  for (const layer of ["chords", "drums", "bass", "melody"])
    assert.ok(
      result.ideas.some((idea) => idea.type === layer && idea.data?.length),
      layer,
    );
  const plan = buildSongPlan({ ...context, sections: [result] });
  assert.ok(plan.events.length > 0);
  assert.ok(
    plan.events.every((event) => Number.isFinite(event.seconds) && event.secondsDuration > 0),
  );
  assert.equal(JSON.stringify(context), before);
  assert.deepEqual(
    varySection(context, result, {}, "subtle", 34),
    varySection(context, result, {}, "subtle", 34),
  );
});
