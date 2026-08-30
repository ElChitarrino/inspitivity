export function beatDurationSeconds(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError("BPM must be greater than zero");
  return 60 / bpm;
}

export function subdivisionDurationSeconds(bpm: number, subdivision: number) {
  if (!Number.isFinite(subdivision) || subdivision <= 0) throw new RangeError("Subdivision must be greater than zero");
  return beatDurationSeconds(bpm) / subdivision;
}

export function progressionLoopDurationMs(chordCount: number, bpm: number) {
  return Math.max(0, chordCount) * beatDurationSeconds(bpm) * 1000;
}

export function melodyLoopDurationMs(events: Array<{ start: number; duration: number }>, bpm: number) {
  if (!events.length) return 0;
  const beats = Math.max(...events.map(event => event.start + event.duration));
  return beats * beatDurationSeconds(bpm) * 1000;
}

export function calculateTapTempo(timestamps: number[]) {
  if (timestamps.length < 2) return null;
  const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]).filter(interval => interval > 0);
  if (!intervals.length) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = intervals.filter(interval => interval >= median * .55 && interval <= median * 1.8);
  const average = filtered.reduce((sum, interval) => sum + interval, 0) / filtered.length;
  return Math.round(60000 / average);
}

export function isAccentedStep(step: number, beatsPerBar: number, subdivision: number) {
  return step % (beatsPerBar * subdivision) === 0;
}

export const DRUM_INSTRUMENTS = ["kick", "snare", "hihat", "crash", "ride"] as const;
export type DrumInstrument = typeof DRUM_INSTRUMENTS[number];
export type DrumStyle = "steady" | "syncopated" | "driving";
export type DrumHit = { instrument: DrumInstrument; step: number; velocity: number };

function drumRandom(seed: number) {
  let value = (Math.abs(Math.trunc(seed)) || 1) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDrumLoop({ beatsPerBar = 4, density = .6, style = "steady", seed = Date.now() }: { beatsPerBar?: number; density?: number; style?: DrumStyle; seed?: number }): DrumHit[] {
  const beats = Math.max(2, Math.min(12, Math.round(beatsPerBar)));
  const steps = beats * 4;
  const random = drumRandom(seed);
  const normalizedDensity = Math.max(.1, Math.min(1, density));
  const hits: DrumHit[] = [];
  const add = (instrument: DrumInstrument, step: number, velocity: number) => {
    const clampedStep = ((step % steps) + steps) % steps;
    if (!hits.some(hit => hit.instrument === instrument && hit.step === clampedStep)) hits.push({ instrument, step: clampedStep, velocity: Math.max(.2, Math.min(1, velocity)) });
  };
  const backbeat = beats >= 4 ? [4, 12] : [Math.floor(steps / 2)];

  add("kick", 0, 1);
  backbeat.forEach(step => add("snare", step, .88));
  for (let step = 0; step < steps; step += 2) add(style === "driving" ? "ride" : "hihat", step, step % 4 === 0 ? .78 : .56);

  for (let beat = 1; beat < beats; beat++) {
    const step = beat * 4;
    const kickChance = style === "driving" ? .82 : style === "syncopated" ? .34 : .54;
    if (random() < kickChance) add("kick", step, .72 + random() * .18);
    if (style === "syncopated" && random() < normalizedDensity * .72) add("kick", step + (random() < .5 ? 1 : 3), .54 + random() * .22);
  }
  for (let step = 1; step < steps; step += 2) if (random() < normalizedDensity * (style === "driving" ? .9 : .62)) add("hihat", step, .35 + random() * .25);
  if (normalizedDensity > .56 && random() < .58) add("crash", 0, .65 + random() * .22);
  if (style === "driving" && normalizedDensity > .55 && random() < .5) add("ride", Math.floor(steps / 2), .55 + random() * .18);

  return hits.sort((a, b) => a.step - b.step || DRUM_INSTRUMENTS.indexOf(a.instrument) - DRUM_INSTRUMENTS.indexOf(b.instrument));
}
