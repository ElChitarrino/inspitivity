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
export type GrooveEnergy = "mellow" | "balanced" | "powerful";
export type DrumHit = {
  instrument: DrumInstrument;
  step: number;
  velocity: number;
};

type GrooveTemplate = {
  kick: number[];
  snare: number[];
  hats: number[];
  ride?: number[];
};

// These are complete, playable one-bar grooves. Generation selects and gently
// dresses a pattern; it never invents unrelated hits one step at a time.
const GROOVE_TEMPLATES: Record<DrumStyle, GrooveTemplate[]> = {
  steady: [
    { kick: [0, 8, 10], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 6, 8, 14], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 7, 10], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
  ],
  syncopated: [
    { kick: [0, 3, 7, 10], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 6, 9, 14], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 3, 8, 11, 14], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
  ],
  driving: [
    { kick: [0, 3, 8, 10, 14], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14], ride: [0, 4, 8, 12] },
    { kick: [0, 2, 7, 8, 11, 14], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14], ride: [0, 4, 8, 12] },
    { kick: [0, 3, 6, 8, 10, 15], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14], ride: [0, 4, 8, 12] },
  ],
  djent: [
    { kick: [0, 2, 3, 7, 8, 11, 14], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 3, 6, 8, 9, 14, 15], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 2, 5, 7, 10, 11, 15], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
  ],
  "odd meter": [
    { kick: [0, 3, 8, 11], snare: [5, 13], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 6, 9, 14], snare: [4, 11], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
    { kick: [0, 3, 7, 10, 14], snare: [5, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14] },
  ],
  linear: [
    { kick: [0, 6, 10], snare: [4, 12], hats: [2, 8, 14] },
    { kick: [0, 7, 11], snare: [4, 12], hats: [2, 6, 9, 14] },
    { kick: [0, 3, 8, 14], snare: [4, 11], hats: [2, 6, 10, 13] },
  ],
};

export function generateDrumLoop({
  beatsPerBar = 4,
  density = 0.6,
  style = "steady",
  energy = "balanced",
  seed = Date.now(),
}: {
  beatsPerBar?: number;
  density?: number;
  style?: DrumStyle;
  energy?: GrooveEnergy;
  seed?: number;
}): DrumHit[] {
  const beats = Math.max(2, Math.min(12, Math.round(beatsPerBar)));
  const steps = beats * 4;
  const normalizedDensity = Math.max(0.1, Math.min(1, density));
  const templates = GROOVE_TEMPLATES[style];
  const seedIndex = Math.abs(Math.trunc(seed));
  const template = templates[seedIndex % templates.length];
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
  const mapStep = (step: number) => Math.round((step / 16) * steps) % steps;
  const detailLimit = Math.max(1, Math.round(normalizedDensity * 5));
  const chooseDetails = (values: number[], keepAtLeast = 1) =>
    values.filter(
      (_, index) =>
        index < keepAtLeast || ((index + seedIndex) % 5) < detailLimit,
    );
  const velocity = {
    mellow: { kick: 0.72, snare: 0.68, hat: 0.38, ride: 0.34 },
    balanced: { kick: 0.88, snare: 0.82, hat: 0.52, ride: 0.48 },
    powerful: { kick: 1, snare: 0.94, hat: 0.66, ride: 0.62 },
  }[energy];

  const kickCount =
    energy === "mellow"
      ? Math.min(2, template.kick.length)
      : energy === "balanced"
        ? Math.max(2, Math.ceil(template.kick.length * normalizedDensity))
        : template.kick.length;
  template.kick
    .slice(0, kickCount)
    .forEach((step, index) =>
      add("kick", mapStep(step), velocity.kick - (index ? 0.08 : 0)),
    );
  template.snare.forEach((step) => add("snare", mapStep(step), velocity.snare));

  const hats =
    energy === "mellow"
      ? template.hats.filter((step) => step % 4 === 0)
      : chooseDetails(template.hats, Math.min(4, template.hats.length));
  hats.forEach((step) =>
    add("hihat", mapStep(step), velocity.hat + (step % 4 === 0 ? 0.09 : 0)),
  );
  if (energy !== "mellow")
    chooseDetails(template.ride ?? [], 0).forEach((step) =>
      add("ride", mapStep(step), velocity.ride),
    );

  // A seed chooses one known-safe embellishment, rather than gambling on every step.
  const variation = seedIndex % 3;
  if (energy === "mellow") {
    if (normalizedDensity > 0.7 && variation === 1)
      add("hihat", mapStep(14), 0.3);
  } else {
    if (variation === 0 && normalizedDensity > 0.55)
      add("snare", mapStep(11), energy === "powerful" ? 0.58 : 0.42);
    if (variation === 1 && normalizedDensity > 0.65)
      add("kick", mapStep(15), energy === "powerful" ? 0.86 : 0.66);
    if (variation === 2 && normalizedDensity > 0.75)
      add("hihat", mapStep(15), energy === "powerful" ? 0.58 : 0.44);
  }
  if (energy === "powerful") add("crash", 0, 0.86);

  return hits.sort(
    (a, b) =>
      a.step - b.step ||
      DRUM_INSTRUMENTS.indexOf(a.instrument) -
        DRUM_INSTRUMENTS.indexOf(b.instrument),
  );
}
