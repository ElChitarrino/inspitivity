/** Compact CC0 FreePats distorted electric-guitar bank; see public/audio/electric-guitar/CREDITS.md. */
export const ELECTRIC_GUITAR_ROOTS = [36,40,41,45,48,50,52,55,59,61,64,67] as const;
const ALTERNATE_ROOTS = new Set<number>([36,40,45,48,52,55]);
const SOFT_ROOTS = new Set<number>([36,40,45,48,52,55]);
const banks = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const pending = new WeakMap<BaseAudioContext, Promise<void>>();

export function electricGuitarRoot(pitch: number): number {
  return ELECTRIC_GUITAR_ROOTS.reduce<number>((best, root) =>
    Math.abs(root-pitch) < Math.abs(best-pitch) ? root : best, ELECTRIC_GUITAR_ROOTS[0]);
}

export function loadElectricGuitarSamples(context: AudioContext): Promise<void> {
  if (banks.has(context)) return Promise.resolve();
  const existing = pending.get(context);
  if (existing) return existing;
  const files = ELECTRIC_GUITAR_ROOTS.flatMap(root => [
    `${root}-hard-1`,
    ...(ALTERNATE_ROOTS.has(root) ? [`${root}-hard-2`] : []),
    ...(SOFT_ROOTS.has(root) ? [`${root}-soft-1`] : []),
  ]);
  const task = (async () => {
    const bank = new Map<string, AudioBuffer>();
    let index = 0;
    await Promise.all(Array.from({length:4},async () => {
      while (index < files.length) {
        const key = files[index++];
        const response = await fetch(`/audio/electric-guitar/${key}.mp3`, {signal:AbortSignal.timeout(20000)});
        if (!response.ok) throw Error("Distorted guitar samples could not load");
        bank.set(key, await context.decodeAudioData(await response.arrayBuffer()));
      }
    }));
    banks.set(context, bank);
  })().finally(() => pending.delete(context));
  pending.set(context, task);
  return task;
}

export function electricGuitarSample(context: AudioContext, pitch: number, soft: boolean, take = 0) {
  const root = electricGuitarRoot(pitch);
  const layer = soft && SOFT_ROOTS.has(root) ? "soft" : "hard";
  const variant = layer === "hard" && ALTERNATE_ROOTS.has(root) ? take % 2 + 1 : 1;
  const buffer = banks.get(context)?.get(`${root}-${layer}-${variant}`);
  return buffer ? {buffer, rate:Math.pow(2,(pitch-root)/12)} : null;
}
