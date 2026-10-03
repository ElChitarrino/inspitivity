"use client";
import { useEffect, useRef, useState } from "react";
import { useAudioEngine } from "../audio/use-audio-engine";
import { Select } from "./select";
import { DRUM_KIT_LABELS, type DrumKit } from "../../packages/sequencing/drum-samples";
import type { SynthVoice } from "../../packages/sequencing/voice-types";

const SOUND_CHARACTER: Record<string, string> = {
  "warm pad": "Slow stereo bloom · soft saw layers · long release",
  glass: "Bell-like partials · bright strike · decaying overtones",
  pluck: "Dry picked attack · short harmonic decay",
  "analog pulse": "Focused analog lead · resonant filter · firm sustain",
  "air flute": "Soft breath-like tone · harmonic body · gentle vibrato",
  "deep bass": "Electric-style bass · pickup transient · warm body",
  "808 bass": "Pitch-drop attack · long sub tail",
  "sub bass": "Pure low fundamental · smooth envelope",
  "acoustic guitar": "Recorded classical guitar · natural string decay",
  "distorted guitar": "Recorded driven guitar · alternate takes · short notes palm-muted",
};
export function SoundEditor({
  label,
  voice,
  options,
  change,
}: {
  label: string;
  voice: string;
  options: readonly string[];
  change: (value: string) => void;
}) {
  const engine = useAudioEngine(),
    token = useRef(0);
  const [message, setMessage] = useState("");
  const stop = () => {
    token.current++;
    engine.stopAll();
  };
  useEffect(
    () => () => {
      token.current++;
      engine.stopAll();
    },
    [engine],
  );
  const audition = async () => {
    window.dispatchEvent(new Event("inspitivity-solo-preview"));
    stop();
    const current = token.current;
    setMessage("Loading sound…");
    try {
      const ready = await engine.unlock(
        label === "Drum" ? (voice as DrumKit) : undefined,
        voice === "acoustic guitar",
        voice === "distorted guitar",
      );
      if (current !== token.current) return;
      if (!ready) {
        setMessage("Sound unavailable. Try again.");
        return;
      }
      if (label === "Drum")
        for (const [instrument, at, velocity] of [
          ["kick", 0, 0.85],
          ["hihat", 0, 0.55],
          ["snare", 0.5, 0.85],
          ["hihat", 0.75, 0.4],
          ["kick", 1, 0.7],
          ["snare", 1.5, 0.8],
        ] as const)
          engine.drum(instrument, at, velocity, voice as DrumKit, 0.8);
      else
        (label === "Chord" ? [48, 52, 55] : label === "Bass" ? [36] : [60, 64, 67]).forEach(
          (pitch, i) =>
            engine.tone(
              pitch,
              label === "Chord" ? i * 0.014 : i * 0.45,
              label === "Chord" ? 1.3 : 0.4,
              label === "Bass" ? 0.08 : 0.045,
              voice as SynthVoice,
            ),
        );
      setMessage("Sound preview");
    } catch {
      if (current === token.current) setMessage("Sound unavailable. Try again.");
    }
  };
  return (
    <section className="sound-editor" aria-label={`Edit ${label} sound`}>
      <h2>Edit Sound</h2>
      <Select
        label={label === "Drum" ? "Drum kit" : `${label} instrument`}
        value={voice}
        options={options}
        set={(value) => {
          stop();
          setMessage("");
          change(value);
        }}
      />
      <p>{SOUND_CHARACTER[voice] ?? DRUM_KIT_LABELS[voice as DrumKit]}</p>
      <button className="secondary-button" onClick={() => void audition()}>
        Preview sound
      </button>
      <small role="status">{message}</small>
      <p>The saved part keeps this instrument.</p>
    </section>
  );
}
