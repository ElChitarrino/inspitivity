import { env, pipeline, LogitsProcessor, LogitsProcessorList, type Tensor } from "@huggingface/transformers";
import { nextLabelTokens } from "../packages/workspace/theme-token-grammar";
import { THEME_FEELS, type ThemeFeel } from "../packages/workspace/theme-explorer";
import { THEME_DESCRIPTIONS, matchThemeEmbedding } from "../packages/workspace/theme-semantic";

env.allowLocalModels = false;
// A dedicated worker already keeps inference off the UI thread. One WASM
// thread also works without cross-origin isolation (including mobile Safari).
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;

// Loaded only after the user opts in. All inference runs in this browser worker.
type LocalGenerator = {
  (prompt: Array<{role:string;content:string}>, options: { max_new_tokens: number; do_sample: boolean; logits_processor: LogitsProcessorList }): Promise<unknown>;
  tokenizer: {encode: (text:string,options:{add_special_tokens:boolean})=>number[];eos_token_id:number};
};
class MoodGrammar extends LogitsProcessor {
  private start: number|null = null;
  constructor(private sequences:number[][],private eos:number){super();}
  _call(inputIds:bigint[][],logits:Tensor){
    this.start ??= inputIds[0].length;
    const width=logits.dims.at(-1)!;
    const data=logits.data as Float32Array;
    inputIds.forEach((ids,row)=>{
      const allowed=nextLabelTokens(this.sequences,ids.slice(this.start!).map(Number),this.eos);
      for(let token=0;token<width;token++) if(!allowed.has(token))data[row*width+token]=-Infinity;
    });
    return logits;
  }
}
let model: LocalGenerator | null = null;
type Embedder = {
  (text:string,options:{pooling:string;normalize:boolean}):Promise<Tensor>;
  tokenizer:{model_max_length:number};
};
let embedder: Embedder | null = null;
let prototypes: Record<ThemeFeel,number[]> | null = null;
let profile: "compact" | "desktop" | null = null;
const progress_callback = (progress: {status?:string;progress?:number})=>{
  if(progress.status==="progress" && typeof progress.progress==="number")self.postMessage({type:"progress",percent:Math.round(progress.progress)});
};
const embed = async(text:string)=>Array.from((await embedder!(text,{pooling:"mean",normalize:true})).data as Float32Array);

let loading: Promise<LocalGenerator> | null = null;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ type: "load" | "analyze"; prompt?: string; id?: number;profile?:"compact"|"desktop" }>) => {
  queue = queue.then(async () => {
  try {
    profile ??= event.data.profile ?? "desktop";
    if(profile==="compact"){
      if(!embedder){
        self.postMessage({type:"status",text:"Preparing compact multilingual theme matching…"});
        const load=pipeline as unknown as (task:string,name:string,options:Record<string,unknown>)=>Promise<Embedder>;
        // This encoder loads only its 118 MB quantized weights. No LLM or
        // autoregressive cache is created on the compact path.
        embedder=await load("feature-extraction","Xenova/paraphrase-multilingual-MiniLM-L12-v2",{revision:"2c4055b12046f11709e9df2c122e59ffbdc2f900",device:"wasm",dtype:"q8",progress_callback});
        embedder.tokenizer.model_max_length=64;
        prototypes={} as Record<ThemeFeel,number[]>;
        for(const feel of THEME_FEELS)prototypes[feel]=await embed(THEME_DESCRIPTIONS[feel]);
        self.postMessage({type:"ready"});
      }
      if(event.data.type==="analyze"){
        const feel=matchThemeEmbedding(await embed((event.data.prompt??"").slice(0,400)),prototypes!);
        self.postMessage({type:"result",id:event.data.id,answer:feel??""});
      }
      return;
    }
    if (!model) {
      self.postMessage({ type: "status", text: "Downloading local model…" });
      const load = pipeline as unknown as (task: "text-generation", name: string, options: Record<string, unknown>) => Promise<LocalGenerator>;
      loading ??= load("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", {
        device: "wasm", dtype: "q8",
        progress_callback,
      });
      model = await loading;
      self.postMessage({ type: "ready" });
    }
    if (event.data.type === "analyze") {
      const prompt = (event.data.prompt ?? "").slice(0, 400);
      const processors=new LogitsProcessorList();
      processors.push(new MoodGrammar(["wistful","warm","bright","restless","soulful","dark"].map(label=>model!.tokenizer.encode(label,{add_special_tokens:false})),model.tokenizer.eos_token_id));
      const result = await model([
        {role:"system",content:"Label the mood of the scene. Reply with one word only: wistful, warm, bright, restless, soulful, dark."},
        {role:"user",content:"Missing an old friend"},{role:"assistant",content:"wistful"},
        {role:"user",content:"Cozy evening by a fireplace"},{role:"assistant",content:"warm"},
        {role:"user",content:"Celebrating a victory in the sunshine"},{role:"assistant",content:"bright"},
        {role:"user",content:"An anxious rush before a deadline"},{role:"assistant",content:"restless"},
        {role:"user",content:"Intimate late-night jazz and neo-soul"},{role:"assistant",content:"soulful"},
        {role:"user",content:"Angry heavy metal in a threatening storm"},{role:"assistant",content:"dark"},
        {role:"user",content:prompt},
      ], { max_new_tokens: 12, do_sample: false, logits_processor:processors });
      const generated = result as Array<{ generated_text?: string | Array<{ content?: string }> }>;
      const text = generated?.[0]?.generated_text;
      const answer = typeof text === "string" ? text : Array.isArray(text) ? String(text.at(-1)?.content ?? "") : "";
      self.postMessage({ type: "result", id:event.data.id, answer });
    }
  } catch (error) {
    loading = null;
    self.postMessage({ type: "error", text: error instanceof Error ? error.message : "Local model could not start." });
  }
  });
};
