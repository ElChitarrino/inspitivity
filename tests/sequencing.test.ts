import assert from "node:assert/strict";
import test from "node:test";
import {
  beatDurationSeconds,
  calculateTapTempo,
  DRUM_INSTRUMENTS,
  generateDrumLoop,
  isAccentedStep,
  melodyLoopDurationMs,
  progressionLoopDurationMs,
  subdivisionDurationSeconds,
} from "../packages/sequencing/index.js";

test("tempo and subdivision timing are musically correct", () => {
  assert.equal(beatDurationSeconds(120), 0.5);
  assert.equal(subdivisionDurationSeconds(120, 2), 0.25);
  assert.throws(() => beatDurationSeconds(0), RangeError);
  assert.throws(() => subdivisionDurationSeconds(120, 0), RangeError);
});

test("progression and melody loop boundaries match their musical duration", () => {
  assert.equal(progressionLoopDurationMs(4, 120), 2000);
  assert.equal(
    progressionLoopDurationMs(16, 120),
    8000,
    "four whole-note chords last sixteen beats",
  );
  assert.equal(
    melodyLoopDurationMs(
      [
        { start: 0, duration: 0.5 },
        { start: 3.5, duration: 0.5 },
      ],
      120,
    ),
    2000,
  );
  assert.equal(melodyLoopDurationMs([], 120), 0);
});

test("tap tempo uses recent intervals and rejects an obvious accidental tap", () => {
  assert.equal(calculateTapTempo([0]), null);
  assert.equal(calculateTapTempo([0, 500, 1000, 1500]), 120);
  assert.equal(calculateTapTempo([0, 500, 520, 1020, 1520]), 120);
});

test("metronome accents only the first subdivision of each bar", () => {
  const accents = Array.from({ length: 16 }, (_, step) =>
    isAccentedStep(step, 4, 2),
  );
  assert.deepEqual(
    accents
      .map((accent, index) => (accent ? index : -1))
      .filter((index) => index >= 0),
    [0, 8],
  );
});

test("drum-loop generation is deterministic and uses only the supported kit", () => {
  const options = {
    beatsPerBar: 4,
    density: 0.7,
    style: "syncopated" as const,
    seed: 44,
  };
  const loop = generateDrumLoop(options);
  assert.deepEqual(loop, generateDrumLoop(options));
  assert.ok(loop.length > 0);
  assert.ok(loop.every((hit) => DRUM_INSTRUMENTS.includes(hit.instrument)));
  assert.ok(
    loop.every(
      (hit) =>
        hit.step >= 0 &&
        hit.step < 16 &&
        hit.velocity >= 0.2 &&
        hit.velocity <= 1,
    ),
  );
  assert.ok(loop.some((hit) => hit.instrument === "kick"));
  assert.ok(loop.some((hit) => hit.instrument === "snare"));
});

test("drum generation varies complete grooves while preserving the pocket", () => {
  const first = generateDrumLoop({
    beatsPerBar: 4,
    density: 0.7,
    style: "steady",
    energy: "balanced",
    seed: 44,
    fill: 0,
  });
  const next = generateDrumLoop({
    beatsPerBar: 4,
    density: 0.7,
    style: "steady",
    energy: "balanced",
    seed: 45,
    fill: 0,
  });
  assert.notDeepEqual(first, next);
  for (const loop of [first, next])
    assert.ok(
      loop
        .filter((hit) => hit.instrument === "snare" && hit.velocity > 0.6)
        .every((hit) => [4, 8, 12].includes(hit.step)),
      "backbeats remain on a conventional or half-time anchor",
    );
});

test("song energy produces a genuinely mellower or more powerful version", () => {
  const mellow = generateDrumLoop({
    style: "driving",
    energy: "mellow",
    density: 0.75,
    seed: 7,
  });
  const powerful = generateDrumLoop({
    style: "driving",
    energy: "powerful",
    density: 0.75,
    seed: 7,
  });
  assert.ok(mellow.length < powerful.length);
  assert.equal(mellow.some((hit) => hit.instrument === "crash"), false);
  assert.equal(powerful.some((hit) => hit.instrument === "crash"), true);
  assert.ok(
    Math.max(...mellow.map((hit) => hit.velocity)) <
      Math.max(...powerful.map((hit) => hit.velocity)),
  );
});

test("every drum style produces structurally diverse multi-bar phrases",()=>{
  for(const style of ["steady","syncopated","driving","djent","odd meter","linear"] as const) {
    const beatsPerBar=style==="odd meter"?7:4;
    const patterns=Array.from({length:128},(_,seed)=>generateDrumLoop({style,seed,bars:4,beatsPerBar}));
    assert.ok(new Set(patterns.map(hits=>hits.map(h=>`${h.instrument}:${h.step}`).join("|"))).size>=110,style);
    assert.ok(patterns.every(hits=>hits.every(h=>Number.isInteger(h.step)&&h.step>=0&&h.step<beatsPerBar*16&&h.velocity>=.2&&h.velocity<=1)));
    assert.ok(patterns.every(hits=>new Set(hits.map(h=>`${h.instrument}:${h.step}`)).size===hits.length));
    if(style==="linear") assert.ok(patterns.every(hits=>new Set(hits.map(h=>h.step)).size===hits.length));
  }
});

test("phrases develop across bars and contain dynamics and tom fills",()=>{
  const hits=generateDrumLoop({bars:4,style:"djent",energy:"powerful",density:1,fill:1,seed:42});
  const first=hits.filter(h=>h.step<16).map(h=>`${h.instrument}:${h.step}`).join("|");
  const last=hits.filter(h=>h.step>=48).map(h=>`${h.instrument}:${h.step-48}`).join("|");
  assert.notEqual(first,last);
  assert.ok(hits.some(h=>h.instrument.startsWith("tom")&&h.step>=48));
  assert.ok(hits.some(h=>h.velocity<.4));
  assert.ok(hits.some(h=>h.velocity>.9));
  assert.notDeepEqual(generateDrumLoop({style:"steady",seed:42}),generateDrumLoop({style:"driving",seed:42}));
});
