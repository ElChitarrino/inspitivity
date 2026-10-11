import assert from "node:assert/strict";
import test from "node:test";
import {
  generateBassPhrase,
  type BassGenerationOptions,
} from "../packages/workspace/bass.js";

const base: BassGenerationOptions = {
  length: 16,
  meter: "4/4",
  meterMap: ["4/4", "4/4", "4/4", "4/4"],
  root: "E",
  mode: "dorian",
  harmony: [
    { symbol: "Em9", beats: 4 },
    { symbol: "Gmaj7", beats: 4 },
    { symbol: "A6", beats: 4 },
    { symbol: "Bm7", beats: 4 },
  ],
  direction: "groove",
  movement: "supportive",
  lockToKick: true,
  kickStarts: [0, 1.5, 2.75],
  kickCycle: 4,
  otherActivity: 0.65,
  seed: 17,
};

const signature = (events: ReturnType<typeof generateBassPhrase>) =>
  events.map((event) => `${event.pitch}:${event.start}:${event.duration}:${event.accent ? 1 : 0}`).join("|");

test("bass generation is deterministic, playable, ordered, and follows harmony anchors", () => {
  const first = generateBassPhrase(base);
  const second = generateBassPhrase(base);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 8);
  assert.ok(first.every((event) => event.pitch >= 23 && event.pitch <= 55));
  assert.ok(first.every((event, index) => index === 0 || event.start > first[index - 1].start));
  for (const [start, pitchClass] of [[0, 4], [4, 7], [8, 9], [12, 11]] as const) {
    const anchor = first.find((event) => event.start === start);
    assert.ok(anchor, `missing chord anchor at beat ${start}`);
    assert.equal(anchor.pitch % 12, pitchClass);
  }
});

test("regeneration changes rhythm, contour, articulation, and accents instead of cloning a preset", () => {
  const generations = Array.from({ length: 16 }, (_, seed) =>
    generateBassPhrase({ ...base, seed: seed + 100 }),
  );
  assert.ok(new Set(generations.map(signature)).size >= 12);
  assert.ok(new Set(generations.map((events) => events.map((event) => event.start).join(","))).size >= 8);
  assert.ok(new Set(generations.map((events) => events.map((event) => event.pitch).join(","))).size >= 8);
  assert.ok(new Set(generations.map((events) => events.map((event) => event.duration).join(","))).size >= 8);
  assert.ok(new Set(generations.map((events) => events.map((event) => event.accent ? 1 : 0).join(""))).size >= 5);
});

test("kick lock supports the pocket without reducing bass to a copy of kick attacks", () => {
  const phrase = generateBassPhrase({ ...base, seed: 441, direction: "syncopated" });
  const kicks = [0, 1.5, 2.75, 4, 5.5, 6.75, 8, 9.5, 10.75, 12, 13.5, 14.75];
  assert.ok(phrase.some((event) => kicks.includes(event.start)), "expected kick-aligned notes");
  assert.ok(phrase.some((event) => !kicks.includes(event.start)), "expected supporting notes between kicks");
});

test("an easy-mode bass phrase reuses rhythmic anchors while following changing chords", () => {
  const phrase=generateBassPhrase({...base,repeatRhythm:true,density:1,otherActivity:0,lockToKick:false,kickStarts:[],seed:17});
  const offsets=[0,1,2,3].map(bar=>new Set(phrase.filter(event=>Math.floor(event.start/4)===bar).map(event=>event.start-bar*4)));
  assert.ok([...offsets[0]].filter(offset=>offsets.every(bar=>bar.has(offset))).length>=3);
  assert.deepEqual([0,1,2,3].map(bar=>(phrase.find(event=>event.start===bar*4)?.pitch??0)%12),[4,7,9,11]);
});

test("groove directions and movement profiles materially change the phrase", () => {
  const directions = ["sustained", "eighth notes", "groove", "syncopated", "progressive"] as const;
  const phrases = directions.map((direction) => generateBassPhrase({ ...base, direction, seed: 901 }));
  assert.equal(new Set(phrases.map(signature)).size, directions.length);

  const rooted = generateBassPhrase({ ...base, movement: "rooted", seed: 902 });
  const melodic = generateBassPhrase({ ...base, movement: "melodic", seed: 902 });
  assert.notEqual(signature(rooted), signature(melodic));
  assert.ok(new Set(melodic.map((event) => event.pitch % 12)).size >= 4);
});

test("progressive bass generation respects changing meter maps", () => {
  const phrase = generateBassPhrase({
    ...base,
    length: 23,
    meter: "7/8",
    meterMap: ["7/8", "5/4", "7/8", "4/4"],
    direction: "progressive",
    movement: "melodic",
    lockToKick: false,
    kickStarts: [],
    seed: 73,
  });
  assert.ok(phrase.some((event) => event.start === 7));
  assert.ok(phrase.some((event) => event.start === 12));
  assert.ok(phrase.some((event) => event.start === 19));
  assert.ok(phrase.every((event) => event.start < 23));
});
