import { pipeline } from "@huggingface/transformers";

// Loaded only after the user opts in. All inference runs in this browser worker.
type LocalGenerator = (messages: Array<{ role: string; content: string }>, options: { max_new_tokens: number; do_sample: boolean }) => Promise<unknown>;
let model: LocalGenerator | null = null;

self.onmessage = async (event: MessageEvent<{ type: "load" | "analyze"; prompt?: string }>) => {
  try {
    if (!model) {
      self.postMessage({ type: "status", text: "Downloading local model…" });
      const load = pipeline as unknown as (task: "text-generation", name: string, options: Record<string, unknown>) => Promise<LocalGenerator>;
      model = await load("text-generation", "onnx-community/SmolLM2-135M-Instruct-ONNX", {
        device: "wasm", dtype: "q4",
        progress_callback: (progress: { status?: string; progress?: number }) => {
          if (progress.status === "progress" && typeof progress.progress === "number")
            self.postMessage({ type: "progress", percent: Math.round(progress.progress) });
        },
      });
      self.postMessage({ type: "ready" });
    }
    if (event.data.type === "analyze") {
      const prompt = (event.data.prompt ?? "").slice(0, 400);
      const result = await model([
        { role: "system", content: "Choose exactly one emotional category for the user's musical scene. Output only one word: wistful, warm, bright, restless, soulful, or dark. Prefer dark for metal or heavy music, soulful for neo-soul or jazz, wistful for nostalgia." },
        { role: "user", content: prompt },
      ], { max_new_tokens: 12, do_sample: false });
      const generated = result as Array<{ generated_text?: string | Array<{ content?: string }> }>;
      const text = generated?.[0]?.generated_text;
      const answer = typeof text === "string" ? text : Array.isArray(text) ? String(text.at(-1)?.content ?? "") : "";
      self.postMessage({ type: "result", answer });
    }
  } catch (error) {
    self.postMessage({ type: "error", text: error instanceof Error ? error.message : "Local model could not start." });
  }
};
