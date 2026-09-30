"use client";
import { useEffect, useRef, useState } from "react";
import { ThemeAIClient, type ModelState, type ThemeWorkerPort } from "../packages/workspace/theme-ai-client";
import type { ThemeFeel } from "../packages/workspace/theme-explorer";

export function useThemeAI(onResult: (feel: ThemeFeel) => void) {
  const latest=useRef(onResult); latest.current=onResult;
  const client=useRef<ThemeAIClient|null>(null);
  const [state,setState]=useState<ModelState>({phase:"off",message:"Optional local AI · Qwen 0.5B · about 520 MB download"});
  useEffect(()=>{
    const instance=new ThemeAIClient(()=>new Worker("/local-ai/theme-model.js",{type:"module"}) as unknown as ThemeWorkerPort,setState,feel=>latest.current(feel));
    client.current=instance;
    return ()=>{instance.dispose();client.current=null;};
  },[]);
  return {state,enable:()=>client.current?.enable(),analyze:(prompt:string)=>client.current?.analyze(prompt),invalidate:()=>client.current?.invalidate(),cancel:()=>{client.current?.dispose();setState({phase:"off",message:"Local AI stopped · instant chord generation remains available"});}};
}
