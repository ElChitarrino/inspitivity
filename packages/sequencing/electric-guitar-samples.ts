import { SampleBank } from "./sample-bank.js";
/** Compact CC0 FreePats distorted electric-guitar bank; see public/audio/electric-guitar/CREDITS.md. */
export const ELECTRIC_GUITAR_ROOTS = [36, 40, 41, 45, 48, 50, 52, 55, 59, 61, 64, 67] as const;
const ALTERNATE_ROOTS = new Set<number>([36, 40, 45, 48, 52, 55]);
const SOFT_ROOTS = new Set<number>([36, 40, 45, 48, 52, 55]);
const bank = new SampleBank("electric");

export function electricGuitarRoot(pitch: number): number {
  return ELECTRIC_GUITAR_ROOTS.reduce<number>(
    (best, root) => (Math.abs(root - pitch) < Math.abs(best - pitch) ? root : best),
    ELECTRIC_GUITAR_ROOTS[0],
  );
}

export async function loadElectricGuitarSamples(context: AudioContext, full = true): Promise<void> {
  await bank.load(context);
  if (full) await bank.load(context, "alternates");
}

export function electricGuitarSample(
  context: AudioContext,
  pitch: number,
  soft: boolean,
  take = 0,
) {
  const root = electricGuitarRoot(pitch);
  const layer = soft && SOFT_ROOTS.has(root) ? "soft" : "hard";
  const variant = layer === "hard" && ALTERNATE_ROOTS.has(root) ? (take % 2) + 1 : 1;
  const buffer =
    bank.sample(context, `${root}-${layer}-${variant}`) ??
    bank.sample(context, `${root}-${layer}-1`);
  return buffer ? { buffer, rate: Math.pow(2, (pitch - root) / 12) } : null;
}
