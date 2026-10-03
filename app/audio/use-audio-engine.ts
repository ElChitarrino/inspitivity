"use client";

import { useEffect, useMemo } from "react";
import { createAudioEngine } from "../../packages/sequencing/audio-engine";

/** Own scheduled sources per component; share only the browser's output graph. */
export function useAudioEngine() {
  const engine = useMemo(() => createAudioEngine(), []);
  useEffect(() => () => engine.stopAll(), [engine]);
  return engine;
}
