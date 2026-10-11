/** One request per bank stage; sample payloads stay individually decodable by Web Audio. */
export type PackedSample = { key: string; data: ArrayBuffer };

export function unpackSamples(packed: ArrayBuffer): PackedSample[] {
  if (packed.byteLength < 4) throw new Error("Truncated sound pack");
  const headerLength = new DataView(packed).getUint32(0, true);
  const bodyOffset = 4 + headerLength;
  if (headerLength > 128_000 || bodyOffset > packed.byteLength)
    throw new Error("Invalid sound pack header");
  const manifest: unknown = JSON.parse(new TextDecoder().decode(packed.slice(4, bodyOffset)));
  if (!Array.isArray(manifest)) throw new Error("Invalid sound pack manifest");
  const keys = new Set<string>();
  return manifest.map((entry) => {
    if (
      !entry ||
      typeof entry.key !== "string" ||
      keys.has(entry.key) ||
      !Number.isSafeInteger(entry.offset) ||
      !Number.isSafeInteger(entry.length) ||
      entry.offset < 0 ||
      entry.length <= 0 ||
      bodyOffset + entry.offset + entry.length > packed.byteLength
    ) {
      throw new Error("Invalid sound pack sample");
    }
    keys.add(entry.key);
    return {
      key: entry.key,
      data: packed.slice(bodyOffset + entry.offset, bodyOffset + entry.offset + entry.length),
    };
  });
}

export class SampleBank {
  private readonly buffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
  private readonly loads = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();
  private readonly completed = new WeakMap<BaseAudioContext, Set<string>>();

  constructor(
    private readonly name: string,
    private readonly deadlineMs = 4500,
  ) {}

  sample(context: BaseAudioContext, key: string) {
    return this.buffers.get(context)?.get(key);
  }

  load(context: AudioContext, stage: "ready" | "alternates" | "crash" = "ready"): Promise<void> {
    if (this.completed.get(context)?.has(stage)) return Promise.resolve();
    const loads = this.loads.get(context) ?? new Map<string, Promise<void>>();
    this.loads.set(context, loads);
    const existing = loads.get(stage);
    if (existing) return existing;
    const task = this.download(context, stage).finally(() => loads.delete(stage));
    loads.set(stage, task);
    return task;
  }

  private async download(context: AudioContext, stage: string) {
    const signal = AbortSignal.timeout(this.deadlineMs);
    const response = await fetch(`/audio/packs/${this.name}-${stage}-v1.bin`, {
      signal,
      priority: stage === "alternates" ? "low" : "high",
    });
    if (!response.ok) throw new Error("Sound download failed. Try Play again.");
    const samples = unpackSamples(await response.arrayBuffer());
    const bank = this.buffers.get(context) ?? new Map<string, AudioBuffer>();
    this.buffers.set(context, bank);
    let index = 0;
    // Bound decoding concurrency on phones while downloading banks in parallel.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (index < samples.length) {
          signal.throwIfAborted();
          const { key, data } = samples[index++];
          if (!bank.has(key)) bank.set(key, await abortable(context.decodeAudioData(data), signal));
          signal.throwIfAborted();
        }
      }),
    );
    const completed = this.completed.get(context) ?? new Set<string>();
    completed.add(stage);
    this.completed.set(context, completed);
  }
}

/** Decoders cannot be cancelled, but a stalled decode must not leave Play spinning. */
function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}
