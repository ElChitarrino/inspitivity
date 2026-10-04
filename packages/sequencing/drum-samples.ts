import { SampleBank } from "./sample-bank.js";
import { DRUM_INSTRUMENTS, type DrumInstrument } from "./index.js";
export const DRUM_KITS = [
  "acoustic studio",
  "dry studio",
  "rock",
  "prog metal",
  "roomy rock",
  "dark acoustic",
  "current",
] as const;
export type DrumKit = (typeof DRUM_KITS)[number];
export const DRUM_KIT_LABELS: Record<DrumKit, string> = {
  "acoustic studio": "Acoustic studio · samples",
  "dry studio": "Dry studio · samples",
  rock: "Rock · samples",
  "prog metal": "Progressive metal · samples",
  "roomy rock": "Roomy rock · samples",
  "dark acoustic": "Dark acoustic · samples",
  current: "Electronic · original synth",
};
export type AcousticDrumKit = Exclude<DrumKit, "current">;
export type DrumKitProfile = {
  route: "dry" | "room";
  filter: BiquadFilterType;
  frequency: number;
  q: number;
  gain: number;
  playbackRate: number;
  tailSeconds: number;
  drive: number;
  level: number;
  click: number;
  body: number;
};

/** Deliberately distinct playback profiles for the shared acoustic sample bank. */
export function drumKitProfile(
  kit: AcousticDrumKit,
  instrument: DrumInstrument,
  bufferDuration: number,
): DrumKitProfile {
  const cymbal = ["hihat", "openhat", "crash", "ride"].includes(instrument);
  switch (kit) {
    case "dry studio":
      return {
        route: "dry",
        filter: "peaking",
        frequency: cymbal ? 5200 : 900,
        q: 1.1,
        gain: -2,
        playbackRate: 1.015,
        tailSeconds: Math.min(bufferDuration, cymbal ? 0.32 : 0.4),
        drive: 0,
        level: 0.95,
        click: 0,
        body: 0,
      };
    case "rock":
      return {
        route: "room",
        filter: "lowshelf",
        frequency: 180,
        q: 0.7,
        gain: 4,
        playbackRate: 0.965,
        tailSeconds: Math.min(bufferDuration, cymbal ? 1.8 : 0.9),
        drive: 1.5,
        level: 0.9,
        click: 0,
        body: instrument === "kick" ? 0.2 : 0,
      };
    case "prog metal":
      return {
        route: "dry",
        filter: "peaking",
        frequency: instrument === "kick" ? 3200 : instrument === "snare" ? 2100 : 4600,
        q: 1.3,
        gain: 5,
        playbackRate: 1.045,
        tailSeconds: Math.min(bufferDuration, cymbal ? 1.1 : instrument === "snare" ? 0.5 : 0.34),
        drive: 2.4,
        level: 0.79,
        click: instrument === "kick" ? 0.22 : instrument === "snare" ? 0.07 : 0,
        body: instrument === "kick" ? 0.26 : 0,
      };
    case "roomy rock":
      return {
        route: "room",
        filter: "peaking",
        frequency: cymbal ? 4200 : 240,
        q: 0.65,
        gain: 2.5,
        playbackRate: 0.935,
        tailSeconds: bufferDuration,
        drive: 1.15,
        level: 0.88,
        click: 0,
        body: instrument === "kick" ? 0.13 : 0,
      };
    case "dark acoustic":
      return {
        route: "dry",
        filter: "lowpass",
        frequency: cymbal ? 3000 : 2200,
        q: 0.85,
        gain: 0,
        playbackRate: 0.94,
        tailSeconds: Math.min(bufferDuration, cymbal ? 1.25 : 0.78),
        drive: 0,
        level: 1.05,
        click: 0,
        body: 0,
      };
    default:
      return {
        route: "dry",
        filter: "peaking",
        frequency: cymbal ? 6200 : 320,
        q: 0.7,
        gain: 0,
        playbackRate: 1,
        tailSeconds: bufferDuration,
        drive: 0,
        level: 1,
        click: 0,
        body: 0,
      };
  }
}
export const DRUM_SAMPLE_KEYS = DRUM_INSTRUMENTS.flatMap((piece) =>
  [0, 1].flatMap((layer) => [1, 2].map((take) => `${piece}-${layer}-${take}`)),
);
export const VIRTUOSITY_KEYS = DRUM_INSTRUMENTS.filter((piece) => piece !== "crash").flatMap(
  (piece) => [0, 1].flatMap((layer) => [1, 2].map((take) => `${piece}-${layer}-${take}`)),
);
const acousticBank = new SampleBank("acoustic");
const metalBank = new SampleBank("metal");

export async function loadDrumSamples(context: AudioContext, full = true): Promise<void> {
  await acousticBank.load(context);
  if (full) await acousticBank.load(context, "alternates");
}

/** Rock and metal use the acoustic crash only, not the entire acoustic kit. */
export function loadCrashSamples(context: AudioContext): Promise<void> {
  return acousticBank.load(context, "crash");
}

export function drumSample(
  context: AudioContext,
  instrument: DrumInstrument,
  velocity: number,
  take: number,
) {
  const layer = velocity < 0.5 ? 0 : 1;
  return (
    acousticBank.sample(context, `${instrument}-${layer}-${(take % 2) + 1}`) ??
    acousticBank.sample(context, `${instrument}-${layer}-1`)
  );
}

export async function loadMetalDrumSamples(context: AudioContext, full = true): Promise<void> {
  await metalBank.load(context);
  if (full) await metalBank.load(context, "alternates");
}

export function metalDrumSample(
  context: AudioContext,
  instrument: DrumInstrument,
  velocity: number,
  take: number,
) {
  const layer = velocity < 0.5 ? 0 : 1;
  return (
    metalBank.sample(context, `${instrument}-${layer}-${(take % 2) + 1}`) ??
    metalBank.sample(context, `${instrument}-${layer}-1`)
  );
}

/** Select only the recorded banks used by the current playback plan. */
export function drumBankRequirement(
  events: readonly { layer: string; voice?: string }[],
): DrumKit | "all" | undefined {
  const voices = new Set(
    events.filter((event) => event.layer === "drums").map((event) => event.voice),
  );
  const metal = voices.has("rock") || voices.has("prog metal");
  const acoustic = ["acoustic studio", "dry studio", "roomy rock", "dark acoustic"].some((voice) =>
    voices.has(voice),
  );
  if (metal && acoustic) return "all";
  if (metal) return "rock";
  return acoustic ? "acoustic studio" : undefined;
}
