// Controlled loader benchmark, not a browser/device measurement.
// Build test modules first: npx tsc -p tsconfig.tests.json
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import {
  loadDrumSamples,
  loadMetalDrumSamples,
  loadCrashSamples,
} from "../.test-dist/packages/sequencing/drum-samples.js";
import { loadGuitarSamples } from "../.test-dist/packages/sequencing/guitar-samples.js";
import { loadElectricGuitarSamples } from "../.test-dist/packages/sequencing/electric-guitar-samples.js";

const bandwidth = 5_000_000 / 8; // A single shared 5 Mbps connection, not 5 Mbps per request.
const latency = 150;
let linkAvailable = 0,
  requests = 0,
  bytes = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, { signal } = {}) => {
  const payload = readFileSync(`public${url}`);
  requests++;
  bytes += payload.length;
  const start = Math.max(performance.now() + latency, linkAvailable);
  linkAvailable = start + (payload.length / bandwidth) * 1000;
  await delay(linkAvailable - performance.now(), undefined, { signal });
  return {
    ok: true,
    arrayBuffer: async () =>
      payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  };
};
async function run(name, load) {
  linkAvailable = 0;
  requests = 0;
  bytes = 0;
  const context = {
    decodeAudioData: async () => {
      await delay(8);
      return { duration: 3 };
    },
  };
  const started = performance.now();
  await load(context);
  const coldMs = Math.round(performance.now() - started);
  const coldRequests = requests,
    coldBytes = bytes;
  const warmStarted = performance.now();
  await load(context);
  const result = {
    scenario: name,
    coldMs,
    warmMs: Math.round(performance.now() - warmStarted),
    requests: coldRequests,
    bytes: coldBytes,
  };
  console.log(JSON.stringify(result));
  if (coldMs > 4500 || requests !== coldRequests)
    throw new Error(`${name} missed the controlled startup budget`);
}
try {
  await run("acoustic drums", (context) => loadDrumSamples(context, false));
  await run("metal + both guitars", (context) =>
    Promise.all([
      loadCrashSamples(context),
      loadMetalDrumSamples(context, false),
      loadGuitarSamples(context),
      loadElectricGuitarSamples(context, false),
    ]),
  );
  await run("both drum banks + both guitars", (context) =>
    Promise.all([
      loadDrumSamples(context, false),
      loadMetalDrumSamples(context, false),
      loadGuitarSamples(context),
      loadElectricGuitarSamples(context, false),
    ]),
  );
} finally {
  globalThis.fetch = originalFetch;
}
