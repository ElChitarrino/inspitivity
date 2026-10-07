export type CharacterVoice = "warm pad" | "glass" | "pluck" | "analog pulse" | "air flute";
export type PartialVoice = {
  ratio: number;
  level: number;
  decay: number;
  detune: number;
  waveform: OscillatorType;
};
export type InstrumentCharacter = {
  attack: number;
  release: number;
  sustain: number;
  cutoff: number;
  resonance: number;
  room: number;
  partials: readonly PartialVoice[];
};
/** Fixed, small voice budgets. Decay belongs to each partial, giving struck instruments a changing spectrum. */
export const INSTRUMENT_CHARACTERS: Record<CharacterVoice, InstrumentCharacter> = {
  "warm pad": {
    attack: 0.22,
    release: 0.65,
    sustain: 0.78,
    cutoff: 1600,
    resonance: 0.45,
    room: 1,
    partials: [
      { ratio: 1, level: 0.48, decay: 0, detune: -6, waveform: "sawtooth" },
      { ratio: 1, level: 0.48, decay: 0, detune: 6, waveform: "sawtooth" },
      { ratio: 0.5, level: 0.18, decay: 0, detune: 0, waveform: "sine" },
    ],
  },
  glass: {
    attack: 0.003,
    release: 0.38,
    sustain: 0.12,
    cutoff: 9500,
    resonance: 0.5,
    room: 1,
    partials: [
      { ratio: 1, level: 0.7, decay: 1.1, detune: 0, waveform: "sine" },
      { ratio: 2.01, level: 0.35, decay: 0.65, detune: 0, waveform: "sine" },
      { ratio: 3.98, level: 0.15, decay: 0.22, detune: 0, waveform: "sine" },
      { ratio: 6.1, level: 0.06, decay: 0.09, detune: 0, waveform: "sine" },
    ],
  },
  pluck: {
    attack: 0.002,
    release: 0.07,
    sustain: 0.08,
    cutoff: 6500,
    resonance: 0.7,
    room: 0,
    partials: [
      { ratio: 1, level: 0.8, decay: 0.42, detune: 0, waveform: "triangle" },
      { ratio: 2, level: 0.2, decay: 0.16, detune: 0, waveform: "sine" },
      { ratio: 3, level: 0.13, decay: 0.06, detune: 0, waveform: "sine" },
    ],
  },
  "analog pulse": {
    attack: 0.006,
    release: 0.09,
    sustain: 0.58,
    cutoff: 2400,
    resonance: 1.5,
    room: 0,
    partials: [
      { ratio: 1, level: 0.55, decay: 0, detune: -2, waveform: "square" },
      { ratio: 1, level: 0.25, decay: 0, detune: 2, waveform: "sawtooth" },
    ],
  },
  "air flute": {
    attack: 0.045,
    release: 0.16,
    sustain: 0.72,
    cutoff: 5100,
    resonance: 0.5,
    room: 1,
    partials: [
      { ratio: 1, level: 0.85, decay: 0, detune: 0, waveform: "sine" },
      { ratio: 2, level: 0.12, decay: 0, detune: 0, waveform: "sine" },
      { ratio: 3, level: 0.035, decay: 0, detune: 0, waveform: "sine" },
    ],
  },
};
export const isCharacterVoice = (voice: string): voice is CharacterVoice =>
  Object.hasOwn(INSTRUMENT_CHARACTERS, voice);
/** Separate note hold from attack/decay so short notes never schedule an envelope backwards. */
export function instrumentEnvelope(
  character: InstrumentCharacter,
  duration: number,
  velocity: number,
) {
  const hold = Math.max(0.02, duration),
    attack = Math.min(character.attack, hold * 0.65);
  const peak = Math.max(0, Math.min(1, velocity));
  const release = Math.min(character.release, Math.max(0.06, hold * 0.6));
  return { attack, hold, end: hold + release, peak, sustain: peak * character.sustain };
}

/** Bound a voice by the sum of partial amplitudes rather than their RMS energy. */
export function characterPeakGain(character: InstrumentCharacter, gain: number): number {
  const amplitude = character.partials.reduce((sum, partial) => sum + Math.abs(partial.level), 0);
  return (Math.max(0, gain) * 0.95) / Math.max(1, amplitude);
}
