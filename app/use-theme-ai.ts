"use client";
import { useEffect, useRef, useState } from "react";
import { ThemeAIClient, type ModelState, type ThemeWorkerPort } from "../packages/workspace/theme-ai-client";
import type { ThemeFeel } from "../packages/workspace/theme-explorer";
import { localAIProfile } from "../packages/workspace/local-ai-policy";

export function useThemeAI(onResult: (feel: ThemeFeel) => void) {
  const latest=useRef(onResult); latest.current=onResult;
  const client=useRef<ThemeAIClient|null>(null);
  const [available,setAvailable]=useState(false);
  const [state,setState]=useState<ModelState>({phase:"off",message:"Instant chord generation works without a model."});
  useEffect(()=>{
    const profile=localAIProfile({userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,deviceMemory:(navigator as Navigator & {deviceMemory?:number}).deviceMemory});
    setAvailable(true);
    setState({phase:"off",message:profile==="compact" ? "Compact local AI · multilingual theme matching · about 140 MB model download" : "Experimental desktop AI · about 520 MB download · uses additional memory while running"});
    const instance=new ThemeAIClient(()=>new Worker("/local-ai/theme-model.js?v=dual-1",{type:"module"}) as unknown as ThemeWorkerPort,setState,feel=>latest.current(feel),120_000,profile);
    client.current=instance;
    const releaseWhenHidden=()=>{if(document.hidden){instance.dispose();setState({phase:"off",message:"Local AI paused to release memory · enable it again when needed"});}};
    document.addEventListener("visibilitychange",releaseWhenHidden);
    return ()=>{document.removeEventListener("visibilitychange",releaseWhenHidden);instance.dispose();client.current=null;};
  },[]);
  return {state,available,enable:()=>client.current?.enable(),analyze:(prompt:string)=>client.current?.analyze(prompt),invalidate:()=>client.current?.invalidate(),cancel:()=>{client.current?.dispose();setState({phase:"off",message:"Local AI stopped · instant chord generation remains available"});}};
}
