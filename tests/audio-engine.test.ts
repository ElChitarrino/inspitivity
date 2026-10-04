import test from "node:test";
import assert from "node:assert/strict";
import { createAudioEngine } from "../packages/sequencing/audio-engine.js";

class Parameter {
  value = 0;
  calls: number[] = [];
  setValueAtTime(_value: number, time: number) {
    this.calls.push(time);
  }
  exponentialRampToValueAtTime(_value: number, time: number) {
    this.calls.push(time);
  }
  linearRampToValueAtTime(_value: number, time: number) {
    this.calls.push(time);
  }
  setTargetAtTime(_value: number, time: number) {
    this.calls.push(time);
  }
  cancelScheduledValues() {}
}
class AudioNodeStub {
  pan = new Parameter();
  gain = new Parameter();
  frequency = new Parameter();
  Q = new Parameter();
  detune = new Parameter();
  delayTime = new Parameter();
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  attack = new Parameter();
  release = new Parameter();
  playbackRate = new Parameter();
  fftSize = 256;
  smoothingTimeConstant = 0;
  type = "";
  onended: (() => void) | null = null;
  started: number[] = [];
  stopped: number[] = [];
  disconnected = false;
  connect(node: AudioNodeStub) {
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(time = 0) {
    this.started.push(time);
  }
  stop(time = 0) {
    this.stopped.push(time);
  }
  setPeriodicWave() {}
  getByteTimeDomainData(values: Uint8Array) {
    values.fill(128);
  }
}
class ContextStub {
  state = "running";
  currentTime = 10;
  sampleRate = 8000;
  destination = new AudioNodeStub();
  nodes: AudioNodeStub[] = [];
  node() {
    const node = new AudioNodeStub();
    this.nodes.push(node);
    return node;
  }
  createGain = () => this.node();
  createOscillator = () => this.node();
  createBufferSource = () => this.node();
  createBiquadFilter = () => this.node();
  createConvolver = () => this.node();
  createDelay = () => this.node();
  createDynamicsCompressor = () => this.node();
  createAnalyser = () => this.node();
  createWaveShaper = () => this.node();
  createStereoPanner = () => this.node();
  createPeriodicWave() {
    return {};
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      duration: length / sampleRate,
      getChannelData: (channel: number) => data[channel],
    };
  }
  async resume() {
    this.state = "running";
  }
}

test("audio engines share the master context but own their scheduled sources", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: ContextStub },
  });
  const first = createAudioEngine(),
    second = createAudioEngine();
  const context = first.get() as unknown as ContextStub;
  t.after(() => {
    first.stopAll();
    second.stopAll();
    context.state = "closed";
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  assert.equal(second.get(), first.get());
  first.tone(60, 0, 0.3, 0.05, "click");
  second.tone(64, 0, 0.3, 0.05, "click");
  assert.equal(first.diagnostics().activeSources, 1);
  assert.equal(second.diagnostics().activeSources, 1);
  first.stopAll();
  assert.equal(first.diagnostics().activeSources, 0);
  assert.equal(second.diagnostics().activeSources, 1);
  second.stopAll();
  assert.equal(second.diagnostics().activeSources, 0);
});

test("silent and invalid notes cannot allocate sources; ended notes release nodes", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: ContextStub },
  });
  const engine = createAudioEngine();
  const context = engine.get() as unknown as ContextStub;
  t.after(() => {
    engine.stopAll();
    context.state = "closed";
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const count = context.nodes.length;
  for (const [pitch, duration, gain] of [
    [NaN, 1, 0.1],
    [60, 0, 0.1],
    [60, 1, 0],
    [128, 1, 0.1],
    [60, Infinity, 0.1],
  ])
    engine.tone(pitch, 0, duration, gain);
  engine.drum("kick", 0, 0);
  engine.drum("kick", 0, NaN);
  assert.equal(context.nodes.length, count);
  assert.equal(engine.diagnostics().activeSources, 0);
  engine.tone(60, 0, 0.3, 0.05, "click");
  const source = context.nodes.find((node) => node.started.length)!;
  assert.equal(source.started[0], context.currentTime);
  assert.ok(source.stopped[0] > source.started[0]);
  source.onended?.();
  assert.equal(engine.diagnostics().activeSources, 0);
  assert.equal(source.disconnected, true);
});

test("stopping before a delayed note cancels the pending queue", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: ContextStub },
  });
  const engine = createAudioEngine();
  const context = engine.get() as unknown as ContextStub;
  t.after(() => {
    engine.stopAll();
    context.state = "closed";
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  engine.tone(60, 30, 0.3, 0.05, "click");
  engine.stopAll();
  context.currentTime += 31;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(context.nodes.filter((node) => node.started.length).length, 0);
  assert.equal(engine.diagnostics().activeSources, 0);
});

test("every synthesized instrument and electronic drum schedules finite audio and releases it", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: ContextStub },
  });
  const engine = createAudioEngine();
  const context = engine.get() as unknown as ContextStub;
  t.after(() => {
    engine.stopAll();
    context.state = "closed";
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  for (const voice of [
    "warm pad",
    "glass",
    "pluck",
    "analog pulse",
    "air flute",
    "deep bass",
    "808 bass",
    "sub bass",
  ] as const) {
    engine.tone(voice.includes("bass") ? 36 : 60, 0, 0.3, 0.05, voice);
    assert.ok(engine.diagnostics().activeSources > 0, voice);
    engine.stopAll();
  }
  for (const instrument of [
    "kick",
    "snare",
    "hihat",
    "openhat",
    "crash",
    "ride",
    "tomhigh",
    "tomlow",
  ] as const) {
    engine.drum(instrument, 0, 0.8, "current");
    assert.ok(engine.diagnostics().activeSources > 0, instrument);
    engine.stopAll();
  }
  for (const node of context.nodes) {
    assert.ok(node.started.every(Number.isFinite));
    assert.ok(node.stopped.every(Number.isFinite));
    for (const parameter of [node.gain, node.frequency, node.detune, node.Q, node.pan])
      assert.ok(parameter.calls.every(Number.isFinite));
  }
});

test("sample banks start together without waiting for native audio; mixed kits all remain playable", async (t) => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const audioDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: ContextStub },
  });
  class NativeAudioStub {
    loop = false;
    preload = "";
    setAttribute() {}
    play() {
      return new Promise<void>(() => {});
    }
  }
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: NativeAudioStub });
  const engine = createAudioEngine();
  const context = engine.get() as unknown as ContextStub & {
    decodeAudioData: () => Promise<AudioBuffer>;
  };
  context.decodeAudioData = async () =>
    context.createBuffer(2, 8000, 8000) as unknown as AudioBuffer;
  const urls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    await gate;
    const { readFile } = await import("node:fs/promises");
    const data = await readFile(`public${url}`);
    return {
      ok: true,
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    } as Response;
  }) as typeof fetch;
  t.after(async () => {
    // Let the low-priority alternate requests finish before restoring global fetch.
    await new Promise((resolve) => setTimeout(resolve, 350));
    engine.stopAll();
    context.state = "closed";
    globalThis.fetch = originalFetch;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
    if (audioDescriptor) Object.defineProperty(globalThis, "Audio", audioDescriptor);
    else Reflect.deleteProperty(globalThis, "Audio");
  });
  const ready = engine.unlock("all", true, true);
  assert.deepEqual(urls.sort(), [
    "/audio/packs/acoustic-ready-v1.bin",
    "/audio/packs/classical-ready-v1.bin",
    "/audio/packs/electric-ready-v1.bin",
    "/audio/packs/metal-ready-v1.bin",
  ]);
  release();
  assert.equal(await ready, true);
  const { drumSample, metalDrumSample } = await import("../packages/sequencing/drum-samples.js");
  assert.ok(drumSample(engine.get(), "kick", 0.8, 0));
  assert.ok(drumSample(engine.get(), "crash", 0.8, 0));
  assert.ok(metalDrumSample(engine.get(), "kick", 0.8, 0));
});
