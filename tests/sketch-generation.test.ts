import assert from "node:assert/strict";
import test from "node:test";
import {
  chordIntervals,
  getScale,
  notePitchClass,
  type Mode,
} from "../packages/music-theory/index.js";
import { decodeRhythmicChord } from "../packages/music-theory/chord-rhythm.js";
import { buildPlayableSketch } from "../packages/workspace/sketch-generator.js";
import {
  SKETCH_PRESETS,
  type SketchOptions,
  type SketchPreset,
} from "../packages/workspace/sketch-presets.js";
import { createSketchPlan, randomizeSketchTiming } from "../packages/workspace/sketch-plan.js";
import {
  grooveBeat,
  grooveLibrary,
  grooveNotes,
  harmonyLibrary,
} from "../packages/workspace/sketch-library.js";
import { buildSketchGroove } from "../packages/workspace/sketch-grammar.js";
import { buildSongPlan } from "../packages/workspace/music.js";
import { decodePitchedNotes } from "../packages/workspace/idea-codecs.js";
import type { MusicalDirection } from "../packages/workspace/directions.js";
import type { Project } from "../packages/workspace/index.js";

const directions: MusicalDirection[] = ["mellow", "hopeful", "driving", "tense"];
const optionsFor = (
  preset: SketchPreset,
  direction: MusicalDirection = "mellow",
): SketchOptions => ({
  root: preset.root,
  mode: preset.mode,
  bpm: preset.bpm,
  meter: preset.meter,
  includeMelody: true,
  includePattern: preset.id === "prog" || preset.id === "heavy",
  extendedForm: false,
  intensity: preset.id === "heavy" ? "hard" : preset.id === "emotive" ? "mellow" : "steady",
  direction,
});
const firstPart = (project: Project, type: "chords" | "drums" | "melody") =>
  project.sections[0].ideas.find((idea) => idea.type === type)!;
const harmonicIdentity = (project: Project) =>
  firstPart(project, "chords")
    .data!.map((value) => {
      const chord = decodeRhythmicChord(value);
      return `${chord.name}|${chord.beats}`;
    })
    .join(";");
const grooveIdentity = (project: Project) =>
  firstPart(project, "drums")
    .data!.map((value) => value.split("|").slice(0, 2).join("|"))
    .join(";");

test("the actual Easy Mode generator keeps meaningful variety within every genre and mood", () => {
  for (const preset of SKETCH_PRESETS)
    for (const direction of directions) {
      const chords = new Set<string>(),
        grooves = new Set<string>(),
        rhythms = new Set<string>();
      for (let seed = 0; seed < 32; seed++) {
        const project = buildPlayableSketch(preset, optionsFor(preset, direction), seed);
        chords.add(harmonicIdentity(project));
        grooves.add(grooveIdentity(project));
        rhythms.add(
          firstPart(project, "chords")
            .data!.map((value) => value.split("|")[3])
            .join(";"),
        );
      }
      assert.ok(chords.size >= 6, `${preset.id}/${direction}: ${chords.size} harmonic timelines`);
      assert.ok(grooves.size >= 4, `${preset.id}/${direction}: ${grooves.size} groove onsets`);
      assert.ok(rhythms.size >= 3, `${preset.id}/${direction}: ${rhythms.size} chord rhythms`);
    }
});

test("mellow acoustic retains an audible eighth/sixteenth pulse instead of deleting offbeats", () => {
  const preset = SKETCH_PRESETS.find((preset) => preset.id === "emotive")!;
  assert.equal(preset.meter, "4/4");
  assert.ok(preset.bpm >= 100);
  const choices = grooveLibrary("emotive", 4);
  assert.ok(choices.length >= 6);
  for (const groove of choices) {
    const mellow = buildSketchGroove(groove, 4, 2, 8, "mellow", "theme");
    const balanced = buildSketchGroove(groove, 4, 2, 8, "balanced", "theme");
    assert.deepEqual(
      mellow.map((hit) => [hit.instrument, hit.step]),
      balanced.map((hit) => [hit.instrument, hit.step]),
    );
    assert.ok(mellow.filter((hit) => hit.instrument === "hihat").length >= 8);
    assert.ok(
      mellow.reduce((sum, hit) => sum + hit.velocity, 0) <
        balanced.reduce((sum, hit) => sum + hit.velocity, 0),
    );
  }
  assert.ok(
    choices.some(
      (groove) =>
        buildSketchGroove(groove, 4, 1, 8, "mellow", "theme").filter(
          (hit) => hit.instrument === "hihat",
        ).length === 16,
    ),
  );
});

test("surprise includes lively mellow acoustic sketches and coherent meter-specific families", () => {
  const timings = Array.from({ length: 64 }, (_, seed) =>
    randomizeSketchTiming("emotive", "mellow", seed),
  );
  assert.deepEqual(new Set(timings.map((timing) => timing.meter)), new Set(["4/4", "6/8", "3/4"]));
  assert.ok(timings.some((timing) => timing.bpm >= 118));
  assert.ok(timings.some((timing) => timing.bpm < 90));
  assert.ok(new Set(timings.map((timing) => timing.bpm)).size >= 25);
  for (const { meter } of timings) {
    const beats = Number(meter.split("/")[0]);
    assert.ok(grooveLibrary("emotive", beats).every((groove) => groove.sourceSteps === beats * 4));
  }
});

test("genre harmony remains authoritative when a mood is selected", () => {
  const rock = new Set<string>(),
    soul = new Set<string>();
  for (let seed = 0; seed < 64; seed++) {
    rock.add(createSketchPlan("rock", "ionian", "4/4", seed, "hopeful").harmony.degrees.join());
    soul.add(createSketchPlan("neo-soul", "ionian", "4/4", seed, "hopeful").harmony.degrees.join());
  }
  assert.ok(soul.has("1,4,0,0"), "major ii–V–I remains available in soul");
  assert.ok(!rock.has("1,4,0,0"), "rock must not inherit soul's entire vocabulary");
  assert.ok(rock.has("0,4,5,3"), "singer-songwriter/anthem schema remains available");
  for (const preset of SKETCH_PRESETS)
    for (const mode of ["ionian", "aeolian", "dorian", "mixolydian", "phrygian"] as Mode[]) {
      const scale = new Set(getScale("C", mode).map(notePitchClass));
      for (const harmony of harmonyLibrary(preset.id, mode)) {
        const seed = 17;
        // Inspect the exact plan's harmonic degrees, not a display name or random pitch hash.
        const plan = createSketchPlan(preset.id, mode, preset.meter, seed);
        assert.equal(
          plan.chordBeats.reduce((sum, beats) => sum + beats, 0),
          4 * Number(preset.meter.split("/")[0]),
        );
        assert.ok(harmony.degrees.every((degree) => degree >= 0 && degree < 7));
      }
      const project = buildPlayableSketch(preset, { ...optionsFor(preset), root: "C", mode }, 17);
      for (const chord of firstPart(project, "chords").data!.map(decodeRhythmicChord)) {
        const root = notePitchClass(chord.name)!;
        assert.ok(
          chordIntervals(chord.name).every((interval) => scale.has((root + interval) % 12)),
          `${preset.id}/${mode}/${chord.name}`,
        );
      }
    }
});

test("swing is a shared clock: drums, comping and bass preserve the same delayed offbeat", () => {
  const groove = grooveLibrary("neo-soul", 4)[0];
  const beat = grooveBeat(0.5, groove, 4);
  const swung = grooveNotes([{ start: 0.5, duration: 0.5, pitch: 60 }], groove, 4);
  assert.equal(swung[0].start, beat);
  assert.equal(swung[0].start + swung[0].duration, 1);
  const hats = buildSketchGroove(groove, 4, 1, 4, "mellow", "theme").filter(
    (hit) => hit.instrument === "hihat",
  );
  assert.ok(hats.some((hit) => Math.abs(hit.step / 4 - beat) < 0.002));
  assert.equal(grooveBeat(4, groove, 4), 4);
  const shuffle = grooveLibrary("emotive", 4).find((groove) => groove.shuffle)!;
  assert.ok(Math.abs(grooveBeat(0.5, shuffle, 4) - 2 / 3) < 0.00001);
  const straight = grooveLibrary("rock", 4)[0];
  assert.equal(grooveBeat(0.5, straight, 4), 0.5);
});

test("generated full songs retain the harmonic hook on return and playable section boundaries", () => {
  for (const preset of SKETCH_PRESETS)
    for (const meter of ["4/4", "6/8", "7/8", "5/4"])
      for (let seed = 0; seed < 4; seed++) {
        const options = { ...optionsFor(preset, "hopeful"), meter, extendedForm: seed % 2 === 0 };
        const project = buildPlayableSketch(preset, options, seed);
        const original = firstPart(project, "chords").data!.map((value) =>
          value.split("|").slice(0, 2).join("|"),
        );
        for (const section of project.sections) {
          const length = section.bars * Number(meter.split("/")[0]);
          const harmony = section.ideas
            .find((idea) => idea.type === "chords")!
            .data!.map(decodeRhythmicChord);
          assert.equal(
            harmony.reduce((sum, chord) => sum + chord.beats, 0),
            Number(meter.split("/")[0]) * 4,
          );
          for (const layer of ["bass", "melody", "riff"] as const)
            for (const note of decodePitchedNotes(
              section.ideas.find((idea) => idea.type === layer) ?? {
                id: "empty",
                type: layer,
                name: "",
                detail: "",
              },
            )) {
              assert.ok(
                note.start >= 0 &&
                  note.duration > 0 &&
                  note.start + note.duration <= length + 0.001,
                `${preset.id}/${meter}/${layer}: ${JSON.stringify(note)}`,
              );
            }
          if (/return|outro|coda|tag|resolve|final/i.test(section.name)) {
            const returned = section.ideas
              .find((idea) => idea.type === "chords")!
              .data!.map((value) => value.split("|").slice(0, 2).join("|"));
            assert.deepEqual(returned, original, `${preset.id} returns to its harmonic hook`);
          }
        }
        const playback = buildSongPlan(project);
        assert.deepEqual(
          new Set(playback.events.map((event) => event.layer)),
          new Set([
            "chords",
            "drums",
            "bass",
            ...(playback.events.some((event) => event.layer === "melody") ? ["melody"] : []),
            ...(playback.events.some((event) => event.layer === "riff") ? ["riff"] : []),
          ]),
        );
        assert.ok(
          playback.events.every(
            (event) =>
              Number.isFinite(event.seconds) &&
              event.seconds >= 0 &&
              event.secondsDuration > 0 &&
              event.seconds + event.secondsDuration <= playback.seconds + 0.001,
          ),
        );
        assert.equal(
          playback.markers.length,
          project.sections.reduce((sum, section) => sum + section.bars, 0),
        );
        assert.equal(project.bpm, options.bpm);
        assert.equal(project.meter, options.meter);
        assert.equal(project.key, `${options.root} ${options.mode}`);
      }
});

test("fixed seeds reproduce musical content and backing-track requests omit foreground parts", () => {
  for (const preset of SKETCH_PRESETS) {
    const options = {
      ...optionsFor(preset),
      includeMelody: false,
      includePattern: false,
      brief: "A quiet backing track",
    };
    const a = buildPlayableSketch(preset, options, 73),
      b = buildPlayableSketch(preset, options, 73);
    assert.deepEqual(
      a.sections.map((section) => section.ideas.map((idea) => [idea.type, idea.data, idea.voice])),
      b.sections.map((section) => section.ideas.map((idea) => [idea.type, idea.data, idea.voice])),
    );
    assert.ok(
      a.sections.every((section) =>
        section.ideas.every((idea) => idea.type !== "melody" && idea.type !== "riff"),
      ),
    );
    assert.equal(a.sections[0].ideas.find((idea) => idea.type === "text")?.detail, options.brief);
  }
});

test("ranked draft pairs differ in real harmony and groove even after quality selection", async () => {
  const { chooseSketchPair, sketchIdentity } = await import(
    "../packages/workspace/sketch-quality.js"
  );
  for (const preset of SKETCH_PRESETS) {
    const selectedHarmony = new Set<string>(),
      selectedGrooves = new Set<string>();
    for (let seed = 0; seed < 12; seed++) {
      const candidates = Array.from({ length: 12 }, (_, index) =>
        buildPlayableSketch(preset, optionsFor(preset), seed + index * 7919),
      );
      const [best, alternative] = chooseSketchPair(candidates);
      const a = sketchIdentity(best),
        b = sketchIdentity(alternative);
      assert.notEqual(
        a.harmony,
        b.harmony,
        `${preset.id}: genuinely different chord movement/timing`,
      );
      assert.notEqual(a.groove, b.groove, `${preset.id}: genuinely different drum onsets`);
      selectedHarmony.add(a.harmony);
      selectedGrooves.add(a.groove);
    }
    assert.ok(
      selectedHarmony.size >= 4,
      `${preset.id}: ranking must not collapse harmonic variety`,
    );
    assert.ok(selectedGrooves.size >= 3, `${preset.id}: ranking must not collapse groove variety`);
  }
});

test("hard and mellow arrangements preserve their requested instrumentation", () => {
  for (const preset of SKETCH_PRESETS) {
    const hard = buildPlayableSketch(preset, { ...optionsFor(preset), intensity: "hard" }, 4);
    const mellow = buildPlayableSketch(preset, { ...optionsFor(preset), intensity: "mellow" }, 4);
    assert.ok(
      hard.sections.every(
        (section) =>
          section.ideas.find((idea) => idea.type === "chords")?.voice === "distorted guitar",
      ),
    );
    assert.ok(
      mellow.sections.every(
        (section) =>
          section.ideas.find((idea) => idea.type === "chords")?.voice === "acoustic guitar",
      ),
    );
  }
});
