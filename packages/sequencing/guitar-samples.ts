import { SampleBank } from "./sample-bank.js";
/** Sparse, CC0 FreePats classical guitar samples prepared by scripts/prepare-guitar-samples.mjs. */
export const GUITAR_SAMPLE_ROOTS = [
  40, 41, 45, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 69, 70, 72, 74, 76, 78, 80, 82, 84,
] as const;
const bank = new SampleBank("classical");

export function guitarSampleRoot(pitch: number): number {
  return GUITAR_SAMPLE_ROOTS.reduce<number>(
    (best, root) => (Math.abs(root - pitch) < Math.abs(best - pitch) ? root : best),
    GUITAR_SAMPLE_ROOTS[0],
  );
}

export function loadGuitarSamples(context: AudioContext): Promise<void> {
  return bank.load(context);
}

export function guitarSample(context: AudioContext, pitch: number) {
  const adjustedPitch = pitch < 40 ? pitch + 12 : pitch;
  const root = guitarSampleRoot(adjustedPitch);
  const buffer = bank.sample(context, String(root));
  return buffer ? { buffer, rate: Math.pow(2, (adjustedPitch - root) / 12) } : null;
}
