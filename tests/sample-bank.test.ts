import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SampleBank, unpackSamples } from "../packages/sequencing/sample-bank.js";
import {
  loadDrumSamples,
  drumSample,
  loadCrashSamples,
  loadMetalDrumSamples,
  drumBankRequirement,
} from "../packages/sequencing/drum-samples.js";
import {
  loadElectricGuitarSamples,
  electricGuitarSample,
} from "../packages/sequencing/electric-guitar-samples.js";

function pack(entries: { key: string; bytes: number[] }[]) {
  let offset = 0;
  const header = new TextEncoder().encode(
    JSON.stringify(
      entries.map(({ key, bytes }) => {
        const record = { key, offset, length: bytes.length };
        offset += bytes.length;
        return record;
      }),
    ),
  );
  const result = new Uint8Array(4 + header.length + offset);
  new DataView(result.buffer).setUint32(0, header.length, true);
  result.set(header, 4);
  offset = 4 + header.length;
  for (const entry of entries) {
    result.set(entry.bytes, offset);
    offset += entry.bytes.length;
  }
  return result.buffer;
}
function asset(url: string) {
  const bytes = readFileSync(`public${url}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

test("pack decoder validates bounds, duplicate keys and malformed headers", () => {
  assert.deepEqual(
    unpackSamples(pack([{ key: "kick", bytes: [1, 2] }])).map(({ key, data }) => ({
      key,
      bytes: [...new Uint8Array(data)],
    })),
    [{ key: "kick", bytes: [1, 2] }],
  );
  assert.throws(() => unpackSamples(new ArrayBuffer(2)), /Truncated/);
  assert.throws(
    () =>
      unpackSamples(
        pack([
          { key: "same", bytes: [1] },
          { key: "same", bytes: [2] },
        ]),
      ),
    /Invalid/,
  );
  const truncated = pack([{ key: "kick", bytes: [1, 2] }]);
  assert.throws(() => unpackSamples(truncated.slice(0, -1)), /Invalid/);
});

test("shared loads deduplicate requests and retry only missing decodes after failure", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let fetches = 0,
    decodes = 0,
    fail = true;
  globalThis.fetch = (async () => {
    fetches++;
    return {
      ok: true,
      arrayBuffer: async () =>
        pack([
          { key: "one", bytes: [1] },
          { key: "two", bytes: [2] },
        ]),
    } as Response;
  }) as typeof fetch;
  const context = {
    decodeAudioData: async (data: ArrayBuffer) => {
      decodes++;
      if (new Uint8Array(data)[0] === 2 && fail) throw Error("Decode failed");
      return { key: new Uint8Array(data)[0] };
    },
  } as unknown as AudioContext;
  const bank = new SampleBank("test");
  await assert.rejects(Promise.all([bank.load(context), bank.load(context)]));
  assert.equal(fetches, 1);
  assert.ok(bank.sample(context, "one"));
  fail = false;
  await bank.load(context);
  await bank.load(context);
  assert.equal(fetches, 2);
  assert.equal(decodes, 3);
  assert.ok(bank.sample(context, "two"));
});

test("first playback retains both velocity layers and every note while deferring alternate takes", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    return { ok: true, arrayBuffer: async () => asset(String(url)) } as Response;
  }) as typeof fetch;
  let decodes = 0;
  const context = {
    decodeAudioData: async () => ({ id: ++decodes, duration: 2 }),
  } as unknown as AudioContext;
  await Promise.all([loadDrumSamples(context, false), loadElectricGuitarSamples(context, false)]);
  assert.equal(urls.length, 2);
  assert.equal(decodes, 34);
  assert.notEqual(drumSample(context, "kick", 0.3, 0), drumSample(context, "kick", 0.8, 0));
  assert.equal(drumSample(context, "kick", 0.8, 0), drumSample(context, "kick", 0.8, 1));
  const initial = electricGuitarSample(context, 36, false, 0)!;
  assert.equal(initial.buffer, electricGuitarSample(context, 36, false, 1)!.buffer);
  await Promise.all([loadDrumSamples(context), loadElectricGuitarSamples(context)]);
  assert.equal(urls.length, 4);
  assert.equal(decodes, 56);
  assert.notEqual(initial.buffer, electricGuitarSample(context, 36, false, 1)!.buffer);
  assert.notEqual(drumSample(context, "kick", 0.8, 0), drumSample(context, "kick", 0.8, 1));
});

test("metal startup downloads only its kit and acoustic crashes", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    return { ok: true, arrayBuffer: async () => asset(String(url)) } as Response;
  }) as typeof fetch;
  let count = 0;
  const context = { decodeAudioData: async () => ({ id: ++count }) } as unknown as AudioContext;
  await Promise.all([loadCrashSamples(context), loadMetalDrumSamples(context, false)]);
  assert.equal(count, 16);
  assert.deepEqual(urls.sort(), [
    "/audio/packs/acoustic-crash-v1.bin",
    "/audio/packs/metal-ready-v1.bin",
  ]);
  assert.ok(drumSample(context, "crash", 0.8, 1));
  assert.equal(drumSample(context, "kick", 0.8, 0), undefined);
});

test("a stalled decode rejects at the loading deadline rather than holding Play indefinitely", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = (async () =>
    ({
      ok: true,
      arrayBuffer: async () => pack([{ key: "slow", bytes: [1] }]),
    }) as Response) as typeof fetch;
  const context = {
    decodeAudioData: () => new Promise((resolve) => setTimeout(() => resolve({}), 100)),
  } as unknown as AudioContext;
  await assert.rejects(new SampleBank("test", 20).load(context), { name: "TimeoutError" });
});

test("playback requests both recorded drum banks only when the song uses both", () => {
  const events = (...voices: string[]) => voices.map((voice) => ({ layer: "drums", voice }));
  assert.equal(drumBankRequirement(events("current")), undefined);
  assert.equal(drumBankRequirement(events("rock", "prog metal")), "rock");
  assert.equal(drumBankRequirement(events("rock", "dry studio")), "all");
  assert.equal(drumBankRequirement(events("roomy rock")), "acoustic studio");
  assert.equal(drumBankRequirement([{ layer: "chords", voice: "rock" }]), undefined);
});
