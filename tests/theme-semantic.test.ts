import assert from "node:assert/strict";
import test from "node:test";
import { matchThemeEmbedding } from "../packages/workspace/theme-semantic.js";
import { THEME_FEELS, type ThemeFeel } from "../packages/workspace/theme-explorer.js";
import { ThemeAIClient, type ThemeWorkerPort } from "../packages/workspace/theme-ai-client.js";

const prototypes=Object.fromEntries(THEME_FEELS.map((feel,index)=>[feel,THEME_FEELS.map((_,i)=>i===index?1:0)])) as Record<ThemeFeel,number[]>;
test("semantic matching handles each feeling, rejects ambiguous and invalid vectors",()=>{
  for(const feel of THEME_FEELS) assert.equal(matchThemeEmbedding(prototypes[feel],prototypes),feel);
  assert.equal(matchThemeEmbedding([1,1,1,1,1,1],prototypes),null);
  assert.equal(matchThemeEmbedding([0,0,0,0,0,0],prototypes),null);
  assert.equal(matchThemeEmbedding([NaN,0,0,0,0,0],prototypes),null);
  assert.equal(matchThemeEmbedding([],prototypes),null);
});

test("compact client never requests desktop profile and feeds semantic results to harmony",()=>{
  const messages: Array<{type:string;profile?:string;id?:number}>=[],results:string[]=[];
  const worker:ThemeWorkerPort={onmessage:null,onerror:null,terminate(){},postMessage(message){messages.push(message as typeof messages[number]);}};
  const client=new ThemeAIClient(()=>worker,()=>{},feel=>results.push(feel),120_000,"compact");
  client.enable();assert.deepEqual(messages[0],{type:"load",profile:"compact"});
  worker.onmessage!({data:{type:"ready"}});client.analyze("A room full of memories");
  worker.onmessage!({data:{type:"result",id:messages.at(-1)!.id,answer:"wistful"}});
  assert.deepEqual(results,["wistful"]);client.dispose();
});
