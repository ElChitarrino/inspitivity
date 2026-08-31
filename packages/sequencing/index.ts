export function beatDurationSeconds(bpm: number) {
  if (!Number.isFinite(bpm) || bpm <= 0)
    throw new RangeError("BPM must be greater than zero");
  return 60 / bpm;
}

export function subdivisionDurationSeconds(bpm: number, subdivision: number) {
  if (!Number.isFinite(subdivision) || subdivision <= 0)
    throw new RangeError("Subdivision must be greater than zero");
  return beatDurationSeconds(bpm) / subdivision;
}

export function progressionLoopDurationMs(chordCount: number, bpm: number) {
  return Math.max(0, chordCount) * beatDurationSeconds(bpm) * 1000;
}

export function melodyLoopDurationMs(
  events: Array<{ start: number; duration: number }>,
  bpm: number,
) {
  if (!events.length) return 0;
  const beats = Math.max(
    ...events.map((event) => event.start + event.duration),
  );
  return beats * beatDurationSeconds(bpm) * 1000;
}

export function calculateTapTempo(timestamps: number[]) {
  if (timestamps.length < 2) return null;
  const intervals = timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - timestamps[index])
    .filter((interval) => interval > 0);
  if (!intervals.length) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = intervals.filter(
    (interval) => interval >= median * 0.55 && interval <= median * 1.8,
  );
  const average =
    filtered.reduce((sum, interval) => sum + interval, 0) / filtered.length;
  return Math.round(60000 / average);
}

export function isAccentedStep(
  step: number,
  beatsPerBar: number,
  subdivision: number,
) {
  return step % (beatsPerBar * subdivision) === 0;
}

export const DRUM_INSTRUMENTS = [
  "kick",
  "snare",
  "hihat",
  "crash",
  "ride",
] as const;
export type DrumInstrument = (typeof DRUM_INSTRUMENTS)[number];
export type DrumStyle =
  "steady" | "syncopated" | "driving" | "djent" | "odd meter" | "linear";
export type DrumHit = {
  instrument: DrumInstrument;
  step: number;
  velocity: number;
};

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

export function generateDrumLoop({
  beatsPerBar = 4,
  density = 0.6,
  style = "steady",
  seed = Date.now(),
}: {
  beatsPerBar?: number;
  density?: number;
  style?: DrumStyle;
  seed?: number;
}): DrumHit[] {
  const beats = Math.max(2, Math.min(12, Math.round(beatsPerBar)));
  const steps = beats * 4;
  const random = drumRandom(seed);
  const normalizedDensity = Math.max(0.1, Math.min(1, density));
  const hits: DrumHit[] = [];
  const add = (instrument: DrumInstrument, step: number, velocity: number) => {
    const clampedStep = ((step % steps) + steps) % steps;
    if (
      !hits.some(
        (hit) => hit.instrument === instrument && hit.step === clampedStep,
      )
    )
      hits.push({
        instrument,
        step: clampedStep,
        velocity: Math.max(0.2, Math.min(1, velocity)),
      });
  };
  const backbeat =
    style === "odd meter"
      ? [Math.floor(steps * 0.42), Math.floor(steps * 0.76)]
      : beats >= 4
        ? [4, 12]
        : [Math.floor(steps / 2)];

  add("kick", 0, 1);
  backbeat.forEach((step) => add("snare", step, 0.88));
  for (let step = 0; step < steps; step += style === "linear" ? 3 : 2)
    add(
      style === "driving" || style === "djent" ? "ride" : "hihat",
      step,
      step % 4 === 0 ? 0.78 : 0.56,
    );

  for (let beat = 1; beat < beats; beat++) {
    const step = beat * 4;
    const kickChance =
      style === "djent"
        ? 0.92
        : style === "driving"
          ? 0.82
          : style === "syncopated" || style === "odd meter"
            ? 0.34
            : style === "linear"
              ? 0.42
              : 0.54;
    if (random() < kickChance) add("kick", step, 0.72 + random() * 0.18);
    if (
      ["syncopated", "djent", "odd meter"].includes(style) &&
      random() < normalizedDensity * 0.72
    )
      add("kick", step + (random() < 0.5 ? 1 : 3), 0.54 + random() * 0.22);
  }
  for (let step = 1; step < steps; step += 2)
    if (
      random() <
      normalizedDensity *
        (style === "driving" || style === "djent" ? 0.9 : 0.62)
    )
      add("hihat", step, 0.35 + random() * 0.25);
  if (normalizedDensity > 0.56 && random() < 0.58)
    add("crash", 0, 0.65 + random() * 0.22);
  if (
    ["driving", "djent"].includes(style) &&
    normalizedDensity > 0.55 &&
    random() < 0.5
  )
    add("ride", Math.floor(steps / 2), 0.55 + random() * 0.18);

  return hits.sort(
    (a, b) =>
      a.step - b.step ||
      DRUM_INSTRUMENTS.indexOf(a.instrument) -
        DRUM_INSTRUMENTS.indexOf(b.instrument),
  );
}
