"use client";
import { useEffect, useRef, useState } from "react";
import { ThemeAIClient, type ModelState, type ThemeWorkerPort } from "../packages/workspace/theme-ai-client";
import type { ThemeFeel } from "../packages/workspace/theme-explorer";
import { localAIBlockReason } from "../packages/workspace/local-ai-policy";

export function useThemeAI(onResult: (feel: ThemeFeel) => void) {
  const latest=useRef(onResult); latest.current=onResult;
  const client=useRef<ThemeAIClient|null>(null);
  const [available,setAvailable]=useState(false);
  const [state,setState]=useState<ModelState>({phase:"off",message:"Instant chord generation works without a model."});
  useEffect(()=>{
    const reason=localAIBlockReason({userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,deviceMemory:(navigator as Navigator & {deviceMemory?:number}).deviceMemory});
    if(reason){setState({phase:"off",message:reason});return;}
    setAvailable(true);
    setState({phase:"off",message:"Experimental desktop AI · about 520 MB download · uses additional memory while running"});
    const instance=new ThemeAIClient(()=>new Worker("/local-ai/theme-model.js",{type:"module"}) as unknown as ThemeWorkerPort,setState,feel=>latest.current(feel));
    client.current=instance;
    return ()=>{instance.dispose();client.current=null;};
  },[]);
  return {state,available,enable:()=>client.current?.enable(),analyze:(prompt:string)=>client.current?.analyze(prompt),invalidate:()=>client.current?.invalidate(),cancel:()=>{client.current?.dispose();setState({phase:"off",message:"Local AI stopped · instant chord generation remains available"});}};
}
