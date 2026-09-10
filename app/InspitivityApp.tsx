"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  chordIntervals,
  voiceChord,
  decodeVoicing,
  type VoicingStyle,
  type HarmonicTension,
  Complexity,
  generateChordProgression,
  generateMelody,
  getScale,
  MelodyMood,
  PhraseShape,
  Mode,
  notePitchClass,
  ProgressionOpening,
  Root,
  seededRandom,
} from "../packages/music-theory";
import { createMidiFile, type MidiNoteEvent } from "../packages/midi";
import {
  beatDurationSeconds,
  calculateTapTempo,
  DRUM_INSTRUMENTS,
  DRUM_PITCHES,
  DRUM_LABELS,
  drumPatternBeats,
  DrumHit,
  DrumInstrument,
  DrumStyle,
  generateDrumLoop,
  GrooveEnergy,
  isAccentedStep,
  melodyLoopDurationMs,
  progressionLoopDurationMs,
  subdivisionDurationSeconds,
} from "../packages/sequencing";
import {
  applyHarmonyColour,
  classifyTension,
  generateProgRiff,
  meterBeats,
  meterMapTotal,
  nextProgMeter,
  PROG_METERS,
  transformMotif,
  transitionDescription,
  type HarmonyColour,
  type MotifTransform,
  type PatternMotion,
  type RiffEvent,
  type TransitionStyle,
} from "../packages/prog";

import { useCloudProjects, saveRecording, getRecording, downloadBackup, restoreBackup } from "./workspace-storage";
import { DraftSession, DraftToolbar, useDraftState, useDraftPreview, type DraftPreview } from "./draft-session";
import { sectionFeel, buildSongPlan, type SongLayer } from "../packages/workspace/music";
import { analyzeArrangement, type ArrangementInsight } from "../packages/workspace/arrangement";
import type { Idea, SongSection, Project, TrackMix, SectionEnergy } from "../packages/workspace";
import { varyIdeaData, varyNotes } from "../packages/workspace/variation";
import { VariationControls } from "./variation-controls";
import { isTheme, resolveInitialTheme, type Theme } from "../packages/theme";

type IdeaDraft = Omit<Idea, "id" | "recordingId">;
type SaveIdea = (type: Idea["type"], name: string, detail: string, data?: string[], chooseDestination?: boolean, voice?: string) => void;
type Screen =
  | "home"
  | "projects"
  | "project"
  | "chords"
  | "melody"
  | "drums"
  | "bass"
  | "riff"
  | "transition"
  | "metronome"
  | "settings";
type ChordDraft = { id: string; name: string; beats: number; pitches?: number[] };
const encodeChord = (c: ChordDraft) => `${c.name}|${c.beats}|${(c.pitches ?? decodeVoicing(c.name)).join(",")}`;
type SynthVoice =
  | "air flute"
  | "warm pad"
  | "glass"
  | "pluck"
  | "analog pulse"
  | "deep bass"
  | "distorted guitar";
type DrumKit = "current" | "rock" | "prog metal";
const freshSeed = () => Math.floor(Math.random() * 1000000000);
const LAYER_LABELS = [
  ["drums", "Drums"],
  ["bass", "Bass"],
  ["chords", "Chords"],
  ["melody", "Melody"],
  ["riff", "Pattern"],
] as const satisfies readonly (readonly [SongLayer, string])[];
const DEFAULT_SECTION_MIX: Record<SongLayer, TrackMix> = {
  drums: { muted: false, solo: false, volume: 0.76 },
  bass: { muted: false, solo: false, volume: 0.62 },
  chords: { muted: false, solo: false, volume: 0.58 },
  melody: { muted: false, solo: false, volume: 0.72 },
  riff: { muted: false, solo: false, volume: 0.54 },
};
const sectionMix = (section?: SongSection): Record<SongLayer, TrackMix> =>
  Object.fromEntries(
    LAYER_LABELS.map(([layer]) => [
      layer,
      { ...DEFAULT_SECTION_MIX[layer], ...section?.mix?.[layer] },
    ]),
  ) as Record<SongLayer, TrackMix>;

const automaticSectionMix = (section: SongSection): Record<SongLayer, TrackMix> => {
  const present = new Set(section.ideas.map((idea) => idea.type));
  const energy = section.energy ?? "balanced";
  const mix = Object.fromEntries(LAYER_LABELS.map(([layer]) => [layer, { ...DEFAULT_SECTION_MIX[layer] }])) as Record<SongLayer, TrackMix>;
  if (energy === "mellow") { mix.drums.volume = .64; mix.bass.volume = .56; mix.chords.volume = .62; }
  if (energy === "powerful") { mix.drums.volume = .78; mix.bass.volume = .66; mix.chords.volume = .52; }
  if (present.has("chords") && present.has("riff")) { mix.chords.volume -= .08; mix.riff.volume -= .05; }
  if (present.has("melody")) mix.melody.volume = energy === "powerful" ? .68 : .74;
  return mix;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function useTheme() {
  const [theme, setThemeState] = useState<Theme>("crimson");
  useEffect(() => {
    const nextTheme = resolveInitialTheme(
      localStorage.getItem("inspitivity-theme"),
      localStorage.getItem("inspitivity-projects") !== null,
    );
    document.documentElement.dataset.theme = nextTheme;
    // Theme storage is an external source; sync it once after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(nextTheme);
  }, []);
  const setTheme = useCallback((nextTheme: Theme) => {
    if (!isTheme(nextTheme)) return;
    localStorage.setItem("inspitivity-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    setThemeState(nextTheme);
  }, []);
  return [theme, setTheme] as const;
}

type SketchPreset = {
  id: "emotive" | "neo-soul" | "prog" | "heavy";
  label: string;
  copy: string;
  accent: string;
  root: Root;
  mode: Mode;
  bpm: number;
  meter: string;
  mood: MelodyMood;
  groove: DrumStyle;
  energy: GrooveEnergy;
  colour: HarmonyColour;
  opening: ProgressionOpening;
  tension: HarmonicTension;
};

const SYNTH_VOICES: SynthVoice[] = [
  "air flute",
  "warm pad",
  "glass",
  "pluck",
  "analog pulse",
  "deep bass",
  "distorted guitar",
];
const PATTERN_STARTS = [
  ["A 16th late", 0.25],
  ["An 8th late", 0.5],
  ["On beat 2", 1],
  ["After beat 2", 1.5],
] as const;
const MIDI_PROGRAMS: Record<SynthVoice, number> = {
  "air flute": 73,
  "warm pad": 89,
  glass: 98,
  pluck: 84,
  "analog pulse": 80,
  "deep bass": 38,
  "distorted guitar": 30,
};
const DRUM_MIDI_NOTES = DRUM_PITCHES;

const ROOTS: Root[] = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const MODES: Mode[] = [
  "major",
  "minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "harmonic minor",
  "minor pentatonic",
];
const COLORS = ["mint", "violet", "amber", "blue", "coral"];
const SKETCH_PRESETS: SketchPreset[] = [
  {
    id: "emotive",
    label: "Emotive space",
    copy: "Sparse, vocal-led and resolving",
    accent: "◌",
    root: "A",
    mode: "minor",
    bpm: 88,
    meter: "6/8",
    mood: "melancholic",
    groove: "steady",
    energy: "mellow",
    colour: "diatonic",
    opening: "away",
    tension: "smooth",
  },
  {
    id: "neo-soul",
    label: "Neo-soul glow",
    copy: "Extended harmony and pocket",
    accent: "✦",
    root: "E",
    mode: "dorian",
    bpm: 102,
    meter: "4/4",
    mood: "calm",
    groove: "syncopated",
    energy: "balanced",
    colour: "diatonic",
    opening: "away",
    tension: "balanced",
  },
  {
    id: "prog",
    label: "Progressive lift",
    copy: "Odd pulse, melody and breathing room",
    accent: "⌁",
    root: "E",
    mode: "dorian",
    bpm: 120,
    meter: "7/8",
    mood: "bright",
    groove: "odd meter",
    energy: "balanced",
    colour: "quartal",
    opening: "surprise",
    tension: "balanced",
  },
  {
    id: "heavy",
    label: "Heavy tension",
    copy: "Low pulse, restraint and impact",
    accent: "◆",
    root: "Eb",
    mode: "phrygian",
    bpm: 132,
    meter: "7/8",
    mood: "dark",
    groove: "djent",
    energy: "powerful",
    colour: "pedal point",
    opening: "surprise",
    tension: "bold",
  },
];
const uid = () => Math.random().toString(36).slice(2, 10);
const clampBpm = (bpm: number) =>
  Math.max(30, Math.min(260, Number.isFinite(bpm) ? Math.round(bpm) : 120));
const titleMode = (mode: Mode) =>
  mode.replace(/\b\w/g, (letter) => letter.toUpperCase());
const normalizeAccidentals = (value: string) =>
  value
    .replace(/C#/g, "Db")
    .replace(/D#/g, "Eb")
    .replace(/F#/g, "Gb")
    .replace(/G#/g, "Ab")
    .replace(/A#/g, "Bb");
const midiNoteName = (pitch: number) =>
  `${ROOTS[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
const VOICING_PITCHES = Array.from({ length: 61 }, (_, index) => 36 + index);
const KEYBOARD_WHITE_KEYS = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
const KEYBOARD_BLACK_KEYS = [
  { pitch: 49, after: 1 }, { pitch: 51, after: 2 },
  { pitch: 54, after: 4 }, { pitch: 56, after: 5 }, { pitch: 58, after: 6 },
  { pitch: 61, after: 8 }, { pitch: 63, after: 9 },
  { pitch: 66, after: 11 }, { pitch: 68, after: 12 }, { pitch: 70, after: 13 },
];

function OnScreenKeyboard({ selectedPitch, onPitch }: { selectedPitch?: number; onPitch: (pitch: number) => void }) {
  return (
    <div className="keyboard-scroll">
      <div className="onscreen-keyboard" role="group" aria-label="Two octave piano keyboard">
        {KEYBOARD_WHITE_KEYS.map((pitch) => (
          <button key={pitch} className={`white-key ${selectedPitch === pitch ? "selected" : ""}`} aria-label={midiNoteName(pitch)} onClick={() => onPitch(pitch)}>
            <span>{midiNoteName(pitch)}</span>
          </button>
        ))}
        {KEYBOARD_BLACK_KEYS.map(({ pitch, after }) => (
          <button key={pitch} className={`black-key ${selectedPitch === pitch ? "selected" : ""}`} style={{ left: `calc(${after} * var(--white-key) - var(--black-key) / 2)` }} aria-label={midiNoteName(pitch)} onClick={() => onPitch(pitch)}>
            <span>{midiNoteName(pitch)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
const projectHarmony = (project?: Project): { root: Root; mode: Mode } => {
  const [savedRoot = "C", ...savedMode] = normalizeAccidentals(
    project?.key ?? "C major",
  ).split(" ");
  const root = ROOTS.includes(savedRoot as Root) ? (savedRoot as Root) : "C";
  const mode = savedMode.join(" ").toLowerCase() as Mode;
  return { root, mode: MODES.includes(mode) ? mode : "major" };
};
const formatProjectKey = (root: Root, mode: Mode) =>
  `${root} ${titleMode(mode)}`;
const safeFilename = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const downloadMidi = (name: string, bytes: Uint8Array) => {
  const blob = new Blob([bytes as BlobPart], { type: "audio/midi" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${safeFilename(name) || "inspitivity-pattern"}.mid`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
};
const makeChordDrafts = (
  root: Root,
  mode: Mode,
  count: number,
  complexity: Complexity,
  seed: number,
  defaultBeats = 4,
  variation = 0,
  colour: HarmonyColour = "diatonic",
  opening: ProgressionOpening = "away",
  voicing: VoicingStyle = "mixed",
  tension: HarmonicTension = "balanced",
  preferredPitchClasses: number[] = [],
): ChordDraft[] =>
  generateChordProgression({ root, mode, bars: count, complexity, seed, opening, tension, preferredPitchClasses }).map(
    (chord, index) => {
      const wiggle = Math.round(
        (variation / 100) * Math.max(1, defaultBeats - 1),
      );
      const offset = wiggle
        ? (Math.abs(seed * 31 + index * 17) % (wiggle * 2 + 1)) - wiggle
        : 0;
      return {
        id: uid(),
        name: applyHarmonyColour(chord.name, root, colour, index),
        beats: Math.max(1, Math.min(8, defaultBeats + offset)),
        pitches: voiceChord(applyHarmonyColour(chord.name, root, colour, index), seed + index*997, voicing),
      };
    },
  );
const decodeChordDrafts = (idea: Idea): ChordDraft[] =>
  (idea.data?.length ? idea.data : idea.detail.split(" · ")).map((value) => {
    const [name, savedBeats, pitches] = value.split("|");
    return { id: uid(), name, beats: Number(savedBeats) || 4, pitches:decodeVoicing(name,pitches) };
  });
const decodeMelodyIdea = (idea: Idea) =>
  (idea.data?.length ? idea.data : idea.detail.split(" · ")).map(
    (value, index) => {
      const [note, start, duration, pitch] = value.split("|");
      return {
        note,
        start: Number(start) || index * 0.5,
        duration: Number(duration) || 0.45,
        pitch: Number(pitch) || 60 + (notePitchClass(note) ?? 0),
        velocity: 0.72,
      };
    },
  );
const sectionPitchContext = (section?: SongSection, omitType?: Idea["type"]) => {
  if (!section) return [];
  const weighted: number[] = [];
  for (const item of section.ideas) {
    if (item.type === omitType || !item.data?.length) continue;
    if (item.type === "melody")
      item.data.forEach((value, index) => {
        const pitch = Number(value.split("|")[3]);
        if (Number.isFinite(pitch)) weighted.push(pitch % 12, ...(index % 4 === 0 ? [pitch % 12] : []));
      });
    if (item.type === "riff" || item.type === "bass")
      item.data.forEach((value) => {
        const pitch = Number(value.split("|")[0]);
        if (Number.isFinite(pitch)) weighted.push(pitch % 12);
      });
  }
  return weighted.map((pitch) => (pitch + 12) % 12);
};
const sectionRhythmicAnchors = (section?: SongSection, omitType?: Idea["type"]) => {
  if (!section) return [];
  const starts: number[] = [];
  for (const item of section.ideas) {
    if (item.type === omitType || !item.data?.length || !["melody","riff","bass"].includes(item.type)) continue;
    item.data.forEach((value,index) => {
      const fields=value.split("|");
      const start=Number(item.type === "melody" ? fields[1] : fields[1]);
      const accented=item.type === "melody" ? index%4===0 : fields[3] === "1";
      if(Number.isFinite(start) && accented) starts.push(start);
    });
  }
  return [...new Set(starts)].sort((a,b)=>a-b);
};
const complementaryMelodyDensity = (section: SongSection | undefined, meter: string) => {
  if(!section) return .6;
  const beats=Math.max(1,sectionBeatTotal(section,meter));
  const events=section.ideas.filter(item=>["riff","bass"].includes(item.type)).reduce((sum,item)=>sum+(item.data?.length??0),0);
  const activity=events/beats;
  return activity>.9 ? .42 : activity<.3 ? .68 : .55;
};
const isDrumInstrument = (value: string): value is DrumInstrument =>
  (DRUM_INSTRUMENTS as readonly string[]).includes(value);
const decodeDrumIdea = (idea: Idea): DrumHit[] =>
  (idea.data ?? [])
    .map((value) => {
      const [instrument, step, velocity] = value.split("|");
      return isDrumInstrument(instrument)
        ? {
            instrument,
            step: Number(step) || 0,
            velocity: Number(velocity) || 0.7,
          }
        : null;
    })
    .filter((hit): hit is DrumHit => hit !== null);
const decodeRiffIdea = (idea: Idea): RiffEvent[] =>
  (idea.data ?? []).map((value) => {
    const [pitch, start, duration, accent, muted] = value.split("|");
    return {
      pitch: Number(pitch) || 40,
      start: Number(start) || 0,
      duration: Number(duration) || 0.3,
      accent: accent === "1",
      muted: muted !== "0",
    };
  });
type BassPattern = "sustained" | "eighth notes" | "groove" | "syncopated" | "progressive";
type BassEvent = { pitch: number; start: number; duration: number; accent: boolean };
const decodeBassIdea = (idea: Idea): BassEvent[] =>
  (idea.data ?? []).map((value) => {
    const [pitch, start, duration, accent] = value.split("|");
    return { pitch: Number(pitch) || 36, start: Number(start) || 0, duration: Number(duration) || .4, accent: accent === "1" };
  });
const encodeBassEvent = (event: BassEvent) => `${event.pitch}|${event.start}|${event.duration}|${event.accent ? 1 : 0}`;
const bassRootPitch = (symbol: string) => 36 + (notePitchClass(symbol) ?? 0);
const generateBassLine = (
  project: Project,
  section: SongSection | undefined,
  pattern: BassPattern,
  lockToKick: boolean,
  seed: number,
): BassEvent[] => {
  const length = section ? sectionBeatTotal(section, project.meter) : meterBeats(project.meter) * 4;
  const fallbackRoot = projectHarmony(project).root;
  const harmonyIdea = section?.ideas.find((idea) => idea.type === "chords");
  const harmony = (harmonyIdea?.data?.length ? harmonyIdea.data : harmonyIdea ? harmonyIdea.detail.split(" · ") : [`${fallbackRoot}|${length}`])
    .map((value) => { const [symbol, beats] = value.split("|"); return { symbol, beats: Math.max(.25, Number(beats) || 4) }; });
  const rootAt = (beat: number) => {
    const cycle = harmony.reduce((sum, chord) => sum + chord.beats, 0) || length;
    let cursor = 0; const position = beat % cycle;
    for (const chord of harmony) { cursor += chord.beats; if (position < cursor) return bassRootPitch(chord.symbol); }
    return bassRootPitch(fallbackRoot);
  };
  let starts: number[] = [];
  if (pattern === "sustained") {
    let cursor = 0;
    while (cursor < length) for (const chord of harmony) { if (cursor >= length) break; starts.push(cursor); cursor += chord.beats; }
  } else {
    const cells: Record<Exclude<BassPattern,"sustained">, number[]> = {
      "eighth notes": [0,.5,1,1.5],
      groove: [0,1,1.5,3],
      syncopated: [0,.75,1.5,2.5,3.25],
      progressive: [0,.75,1.5,2.25,3.5,4.25],
    };
    const cycle = pattern === "progressive" ? 5 : 4;
    for (let offset = 0; offset < length; offset += cycle)
      starts.push(...cells[pattern].map((beat) => offset + beat).filter((beat) => beat < length));
  }
  if (lockToKick) {
    const drums = section?.ideas.find((idea) => idea.type === "drums");
    const kickStarts = (drums?.data ?? []).filter((value) => value.startsWith("kick|")).map((value) => Number(value.split("|")[1]) / 4).filter(Number.isFinite);
    const cycle = drumPatternBeats(drums?.data ?? [], meterBeats(project.meter));
    if (kickStarts.length && cycle > 0) {
      starts = [];
      for (let offset = 0; offset < length; offset += cycle) starts.push(...kickStarts.map((beat) => offset + beat).filter((beat) => beat < length));
    }
  }
  const chordStarts = pattern === "sustained" ? starts : harmony.reduce<number[]>((result, chord) => {
    const previous = result.at(-1) ?? 0;
    return [...result, previous + chord.beats];
  }, [0]).filter((beat) => beat < length);
  starts = [...new Set([...starts, ...chordStarts])].sort((a,b) => a-b);
  const scale = getScale(projectHarmony(project).root, projectHarmony(project).mode).map((note) => notePitchClass(note)).filter((pitch): pitch is number => pitch !== null);
  return starts.map((start, index) => {
    let pitch = rootAt(start);
    if (pattern === "progressive" && index % 4 === 3) {
      const candidate = [pitch + 2, pitch + 3].find((value) => scale.includes(value % 12));
      if (candidate) pitch = candidate;
    }
    const next = starts[index + 1] ?? length;
    const duration = pattern === "sustained" ? Math.max(.25, next - start - .08) : Math.min(.46, Math.max(.18, next - start - .06));
    return { pitch, start, duration, accent: index === 0 || ((index + seed) % 4 === 0) };
  });
};
const sectionMeterMap = (section: SongSection, fallback: string) =>
  Array.from(
    { length: section.bars },
    (_, index) => section.meterMap?.[index] ?? fallback,
  );
const sectionBeatTotal = (section: SongSection, fallback: string) =>
  meterMapTotal(sectionMeterMap(section, fallback), fallback);
const inferGrooveContext = sectionFeel;
const chordRole = (symbol: string, root: Root, mode: Mode) => {
  const degree = getScale(root, mode).findIndex(
    (note) => notePitchClass(note) === notePitchClass(symbol),
  );
  if (degree < 0) return "chromatic";
  const suffix = symbol.replace(/^[A-G](?:b|#)?/, "");
  const diminished = /dim|°/.test(suffix);
  const minor = diminished || /^m(?!aj)/.test(suffix);
  const numeral = ["I", "II", "III", "IV", "V", "VI", "VII"][degree];
  const role = [
    "tonic / root",
    "supertonic",
    "mediant",
    "subdominant",
    "dominant",
    "submediant",
    "leading tone",
  ][degree];
  return `${minor ? numeral.toLowerCase() : numeral}${diminished ? "°" : ""} · ${role}`;
};

function reinforceDrumAccents(hits: DrumHit[], starts: number[], phraseSteps: number) {
  const next = hits.map((hit) => ({ ...hit }));
  starts.slice(0, 6).forEach((start) => {
    const step = Math.round(start * 4);
    if (step >= 0 && step < phraseSteps && !next.some((hit) => hit.instrument === "kick" && hit.step === step))
      next.push({ instrument:"kick", step, velocity:.78 });
  });
  return next.sort((a,b) => a.step-b.step);
}

function buildPlayableSketch(preset: SketchPreset): Project {
  const seed = freshSeed();
  const random = seededRandom(seed);
  const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)];
  const beatsPerBar = meterBeats(preset.meter);
  const forms: Record<SketchPreset["id"], Array<Array<{ name:string; color:string; energy:number }>>> = {
    emotive: [
      [{name:"Intro",color:"violet",energy:.32},{name:"Verse",color:"mint",energy:.48},{name:"Bloom",color:"amber",energy:.64}],
      [{name:"Verse",color:"blue",energy:.4},{name:"Lift",color:"violet",energy:.58},{name:"Release",color:"mint",energy:.34},{name:"Outro",color:"amber",energy:.24}],
    ],
    "neo-soul": [
      [{name:"Pocket A",color:"mint",energy:.48},{name:"Turn",color:"violet",energy:.58},{name:"Hook",color:"amber",energy:.66}],
      [{name:"Intro",color:"blue",energy:.36},{name:"Verse",color:"mint",energy:.52},{name:"Lift",color:"violet",energy:.62},{name:"Return",color:"amber",energy:.54}],
    ],
    prog: [
      [{name:"Theme A",color:"violet",energy:.44},{name:"Development",color:"blue",energy:.6},{name:"Return",color:"amber",energy:.7}],
      [{name:"Intro",color:"mint",energy:.36},{name:"Theme",color:"violet",energy:.54},{name:"Contrast",color:"blue",energy:.46},{name:"Climax",color:"coral",energy:.76}],
    ],
    heavy: [
      [{name:"Intro",color:"blue",energy:.34},{name:"Riff A",color:"violet",energy:.62},{name:"Impact",color:"coral",energy:.82}],
      [{name:"Pulse",color:"mint",energy:.5},{name:"Riff A",color:"violet",energy:.7},{name:"Contrast",color:"blue",energy:.42},{name:"Return",color:"coral",energy:.86}],
    ],
  };
  const form = pick(forms[preset.id]);
  const sections = form.map((formSection, sectionIndex): SongSection => {
    const sectionSeed = seed + sectionIndex * 17;
    const finalSection = sectionIndex === form.length - 1;
    const bars = pick(preset.id === "emotive" ? [4,4,6,8] : [4,4,8]);
    const density = Math.max(.25, Math.min(.9, formSection.energy + (random()-.5)*.12));
    const chordCount = pick(preset.id === "neo-soul" || preset.id === "prog" ? [4,4,5,6] : [3,4,4,5]);
    const chords = makeChordDrafts(
      preset.root, preset.mode, chordCount,
      preset.id === "neo-soul" || preset.id === "prog" ? "advanced" : "medium",
      sectionSeed, beatsPerBar, finalSection ? pick([0,8,14]) : pick([0,0,6]),
      preset.colour, finalSection && random() > .45 ? "tonic" : preset.opening,
      pick(["mixed","open","drop 2"] as VoicingStyle[]), preset.tension,
    );
    const melody = fitMelodyToChords(generateMelody({
      root:preset.root, mode:preset.mode,
      notes:Math.round(10+density*pick([18,22,26])), density,
      mood:sectionIndex===0 ? "calm" : preset.mood, seed:sectionSeed+7,
      shape:pick(sectionIndex===0 ? ["floating","flow"] : finalSection ? ["hook","answer","flow"] : ["flow","answer"]),
    }),chords);
    const addRiff = (preset.id === "prog" || preset.id === "heavy") && (finalSection || random() > .58);
    const riff = addRiff ? fitMelodyToChords(generateProgRiff({
      root:preset.root, mode:preset.mode, beats:beatsPerBar,
      cycle:preset.id === "heavy" ? pick([5,7]) : pick([5,7,9]),
      grouping:preset.id === "heavy" ? "3+2+2" : "2+2+3",
      density:preset.id === "heavy" ? .72 : .52, seed:sectionSeed+23,
      startOffset:pick([.25,.5,1]), motion:preset.id === "heavy" ? "anchor" : "orbit",
    }).map((note)=>({...note,note:midiNoteName(note.pitch),velocity:note.accent?.8:.62})),chords) : [];
    let drums = generateDrumLoop({ beatsPerBar, density, style:sectionIndex===0 ? "steady" : preset.groove, energy:sectionIndex===0 ? "mellow" : preset.energy, seed:sectionSeed+13, bars });
    drums = reinforceDrumAccents(drums,(riff.length ? riff : melody).filter((_,index)=>index%4===0).map(note=>note.start),beatsPerBar*bars*4);
    const ideas: Idea[] = [
      { id:uid(),type:"chords",name:`${formSection.name} harmony`,voice:preset.id==="heavy"?"distorted guitar":preset.id==="emotive"?"glass":"warm pad",detail:chords.map(chord=>chord.name).join(" · "),data:chords.map(encodeChord) },
      { id:uid(),type:"melody",name:`${formSection.name} motif`,detail:melody.map(note=>note.note).join(" · "),data:melody.map(note=>`${note.note}|${note.start}|${note.duration}|${note.pitch}`) },
      { id:uid(),type:"drums",name:`${formSection.name} pocket`,detail:`${drums.length} hits · ${preset.meter}`,data:drums.map(hit=>`${hit.instrument}|${hit.step}|${hit.velocity}|${beatsPerBar*4}`) },
    ];
    if(riff.length) ideas.push({ id:uid(),type:"riff",name:`${formSection.name} pulse`,detail:`${riff.length} notes · ${preset.meter}`,data:riff.map(note=>`${note.pitch}|${note.start}|${note.duration}|${note.accent?1:0}|${note.muted?1:0}`) });
    const section: SongSection = { id:uid(),name:formSection.name,bars,color:formSection.color,ideas,meterMap:Array.from({length:bars},()=>preset.meter),energy:sectionIndex===0?"mellow":preset.energy };
    const sketchContext: Project = { id:"preview",name:preset.label,bpm:preset.bpm,meter:preset.meter,key:formatProjectKey(preset.root,preset.mode),updated:0,sections:[section] };
    const bass = generateBassLine(sketchContext,section,sectionIndex===0?"sustained":"groove",true,sectionSeed+29);
    ideas.push({ id:uid(),type:"bass",name:`${formSection.name} bass`,detail:`${bass.length} notes · chord and kick aware`,data:bass.map(encodeBassEvent),voice:"deep bass" });
    section.mix=automaticSectionMix(section);
    return section;
  });
  return {
    id: uid(),
    name: `${preset.label} sketch`,
    bpm: preset.bpm,
    meter: preset.meter,
    key: formatProjectKey(preset.root, preset.mode),
    updated: Date.now(),
    sections,
  };
}

const STARTER_PROJECTS: Project[] = [
  {
    id: "midnight",
    name: "Midnight Thoughts",
    bpm: 124,
    meter: "4/4",
    key: "E Dorian",
    updated: Date.now(),
    sections: [
      {
        id: "intro",
        name: "Intro",
        bars: 4,
        color: "violet",
        ideas: [
          {
            id: "i1",
            type: "text",
            name: "Atmosphere",
            detail: "Start sparse. Let the guitar harmonics breathe.",
          },
        ],
      },
      {
        id: "verse",
        name: "Verse",
        bars: 8,
        color: "mint",
        ideas: [
          {
            id: "i2",
            type: "chords",
            name: "Verse harmony",
            detail: "Em9 · A13 · Dmaj9 · Bm7",
            data: ["Em9", "A13", "Dmaj9", "Bm7"],
          },
        ],
      },
      { id: "chorus", name: "Chorus", bars: 8, color: "amber", ideas: [] },
    ],
  },
  {
    id: "fading",
    name: "Fading Lights",
    bpm: 98,
    meter: "6/8",
    key: "A minor",
    updated: Date.now() - 86400000,
    sections: [
      { id: "f-verse", name: "Verse", bars: 8, color: "blue", ideas: [] },
      {
        id: "f-hook",
        name: "Hook",
        bars: 4,
        color: "coral",
        ideas: [
          {
            id: "f1",
            type: "text",
            name: "Lyric seed",
            detail: "Leave the last word hanging.",
          },
        ],
      },
    ],
  },
];

function Wave({ tone = "mint", bars = 7 }: { tone?: string; bars?: number }) {
  return (
    <div className={`wave-mark ${tone}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ height: 10 + ((i * 17 + 11) % 30) }} />
      ))}
    </div>
  );
}

function usePhoneInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & {
      standalone?: boolean;
    };
    const hydrate = window.setTimeout(() => {
      setStandalone(
        window.matchMedia("(display-mode: standalone)").matches ||
          navigatorWithStandalone.standalone === true,
      );
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    }, 0);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* online use remains available when offline registration fails */
      });
    }
    return () => {
      window.clearTimeout(hydrate);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
    return choice.outcome === "accepted";
  }, [installPrompt]);

  return {
    canInstall: Boolean(installPrompt),
    install,
    isIos,
    standalone,
  };
}

function Topbar({
  title,
  subtitle,
  onBack,
  onCreate,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onCreate?: () => void;
}) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="back-button" onClick={onBack} aria-label="Go back">
          ←
        </button>
      ) : (
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h1>{title}</h1>
        </div>
      )}
      {onBack && (
        <div className="center-title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
      {onCreate && (
        <button
          className="round-button"
          onClick={onCreate}
          aria-label="Create a project"
        >
          +
        </button>
      )}
    </header>
  );
}

function BottomNav({
  screen,
  go,
  create,
}: {
  screen: Screen;
  go: (s: Screen) => void;
  create: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const groups: { label: string; destinations: [Screen, string, string][] }[] = [
    { label: "Workspace", destinations: [["home", "⌂", "Studio"], ["projects", "▱", "Projects"]] },
    { label: "Create parts", destinations: [
      ["drums", "▦", "Drums"], ["chords", "♯", "Chords"],
      ["bass", "♭", "Bass"], ["melody", "♥", "Melody"], ["riff", "⇶", "Patterns"],
    ] },
    { label: "Tools", destinations: [
      ["transition", "⇄", "Transitions"], ["metronome", "♩", "Metronome"],
      ["settings", "◎", "Settings"],
    ] },
  ];
  const mobilePrimary = new Set<Screen>(["home", "projects", "metronome", "settings"]);
  const creating = ["drums", "chords", "bass", "melody", "riff", "transition"].includes(screen);
  const navigateFromMenu = (target: Screen) => { setOpen(false); go(target); };
  return <>
    <button className="studio-nav-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "×" : "☰"}</button>
    <button className={`studio-nav-backdrop ${open ? "is-open" : ""}`} aria-label="Close navigation" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
    <nav className={`studio-nav ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`} aria-label="Main navigation">
    <button className="studio-nav-collapse" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? "→" : "←"}</button>
    <button className="studio-brand" aria-label="Inspitivity studio" onClick={() => navigateFromMenu("home")}><span className="brand-mark"><img src="/icon-192.png" alt="" /></span><span>inspitivity<small>SONGWRITING STUDIO</small></span></button>
    <button className="studio-create" aria-label="Create new" onClick={() => { setOpen(false); create(); }}><b>＋</b><span>Create new</span></button>
    <div className="studio-destinations">
      <button className="studio-mobile-create" aria-label="Create" aria-current={creating ? "page" : undefined} onClick={create}><b aria-hidden="true">＋</b><span>Create</span></button>
      {groups.map(group => <div className="nav-group" key={group.label}>
        <span className="nav-group-label">{group.label}</span>
        {group.destinations.map(([target, icon, label]) =>
          <button className={`nav-${target} ${mobilePrimary.has(target) ? "" : "nav-mobile-hidden"}`} key={target} aria-label={label} aria-current={screen === target || target === "projects" && screen === "project" ? "page" : undefined}
            onClick={() => navigateFromMenu(target)}><b aria-hidden="true">{icon}</b><span>{label}</span></button>
        )}
      </div>)}
    </div>
    <span className="studio-nav-foot">A space for your next song.</span>
    </nav>
  </>;
}

type SharedAudioGraph = {
  context: AudioContext;
  input: GainNode;
  analyser: AnalyserNode;
};

let sharedAudioGraph: SharedAudioGraph | null = null;
let sharedNativeAudioUnlock: HTMLAudioElement | null = null;

function silentWavUrl() {
  const sampleRate = 8000;
  const sampleCount = 800;
  const buffer = new ArrayBuffer(44 + sampleCount);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, sampleCount, true);
  for (let index = 44; index < buffer.byteLength; index++)
    view.setUint8(index, 128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function useAudioEngine() {
  return useMemo(() => {
    const sources = new Set<AudioScheduledSourceNode>();
    const getGraph = (): SharedAudioGraph => {
      if (sharedAudioGraph && sharedAudioGraph.context.state !== "closed")
        return sharedAudioGraph;
      const AudioContextConstructor =
        window.AudioContext ??
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
      if (!AudioContextConstructor)
        throw new Error("Web Audio is not supported on this device.");
      const context = new AudioContextConstructor({ latencyHint: "interactive" });
      const input = context.createGain();
      const dry = context.createGain();
      const reverb = context.createConvolver();
      const wet = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const master = context.createGain();
      const analyser = context.createAnalyser();

      const impulseLength = Math.floor(context.sampleRate * 1.45);
      const impulse = context.createBuffer(2, impulseLength, context.sampleRate);
      for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
        const data = impulse.getChannelData(channel);
        for (let index = 0; index < impulseLength; index++) {
          const fade = Math.pow(1 - index / impulseLength, 2.7);
          data[index] = (Math.random() * 2 - 1) * fade;
        }
      }
      reverb.buffer = impulse;
      dry.gain.value = 0.92;
      wet.gain.value = 0.12;
      compressor.threshold.value = -22;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.24;
      master.gain.value = 0.92;
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.2;

      input.connect(dry).connect(compressor);
      input.connect(reverb).connect(wet).connect(compressor);
      compressor.connect(master).connect(analyser).connect(context.destination);
      const createdGraph = { context, input, analyser };
      sharedAudioGraph = createdGraph;
      return createdGraph;
    };
    const get = () => {
      const { context } = getGraph();
      if (context.state === "suspended") void context.resume();
      return context;
    };
    const unlock = async () => {
      const { context, input } = getGraph();
      if (!sharedNativeAudioUnlock) {
        sharedNativeAudioUnlock = new Audio(silentWavUrl());
        sharedNativeAudioUnlock.loop = true;
        sharedNativeAudioUnlock.preload = "auto";
        sharedNativeAudioUnlock.setAttribute("playsinline", "");
      }
      const nativeUnlock = sharedNativeAudioUnlock.play().catch(() => undefined);
      const contextUnlock =
        context.state === "running" ? Promise.resolve() : context.resume();
      await Promise.allSettled([nativeUnlock, contextUnlock]);
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(1, 1, context.sampleRate);
      silence.connect(input);
      silence.start();
      return context.state === "running";
    };
    const tone = (
      midi: number,
      start = 0,
      duration = 0.22,
      gain = 0.07,
      voice: SynthVoice | "click" = "pluck",
    ) => {
      const ctx = get();
      const when = ctx.currentTime + start;
      const volume = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const profiles = {
        "air flute": {
          type: "sine" as OscillatorType,
          attack: 0.055,
          cutoff: 3100,
          release: 0.24,
          detune: 0,
        },
        "distorted guitar": { type: "sawtooth" as OscillatorType, attack: 0.004, cutoff: 3800, release: 0.11, detune: 3 },
        "warm pad": { type: "sawtooth" as OscillatorType, attack: 0.12, cutoff: 1250, release: 0.42, detune: 7 },
        glass: { type: "sine" as OscillatorType, attack: 0.03, cutoff: 2400, release: 0.38, detune: 0 },
        pluck: { type: "triangle" as OscillatorType, attack: 0.004, cutoff: 2600, release: 0.12, detune: 0 },
        "analog pulse": { type: "square" as OscillatorType, attack: 0.008, cutoff: 1500, release: 0.16, detune: 5 },
        "deep bass": { type: "sawtooth" as OscillatorType, attack: 0.012, cutoff: 520, release: 0.2, detune: 0 },
        click: { type: "sine" as OscillatorType, attack: 0.001, cutoff: 7000, release: 0.025, detune: 0 },
      } as const;
      const profile = profiles[voice] ?? profiles.pluck;
      const oscillators = [0, ...(profile.detune ? [-profile.detune, profile.detune] : [])].map((detune) => {
        const oscillator = ctx.createOscillator();
        oscillator.type = profile.type;
        oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        oscillator.detune.value = detune;
        oscillator.connect(filter);
        sources.add(oscillator);
        oscillator.onended = () => sources.delete(oscillator);
        return oscillator;
      });
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.max(220, profile.cutoff * 0.46), when);
      filter.frequency.exponentialRampToValueAtTime(
        profile.cutoff,
        when + Math.max(0.02, profile.attack),
      );
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(180, profile.cutoff * 0.58),
        when + duration + profile.release,
      );
      // The driven guitar has much more perceived loudness than the clean
      // oscillator voices, so leave it with extra headroom in every player.
      const voiceLevel = voice === "distorted guitar" ? 0.7 : 1;
      const scaledGain = (gain * 1.35 * voiceLevel) / Math.sqrt(oscillators.length);
      volume.gain.setValueAtTime(0.0001, when);
      volume.gain.linearRampToValueAtTime(scaledGain, when + profile.attack);
      volume.gain.linearRampToValueAtTime(voice === "glass" ? scaledGain * 0.5 : scaledGain, Math.max(when + profile.attack, when + duration * 0.7));
      volume.gain.exponentialRampToValueAtTime(
        0.0001,
        when + duration + profile.release,
      );
      if (voice === "distorted guitar") {
        const drive = ctx.createWaveShaper();
        const curve = new Float32Array(2048);
        for (let i=0; i<curve.length; i++) curve[i] = Math.tanh(5 * (2*i/(curve.length-1)-1));
        drive.curve = curve; drive.oversample = "4x";
        const cabinet = ctx.createBiquadFilter();
        cabinet.type = "lowpass"; cabinet.frequency.value = 4200; cabinet.Q.value = 0.7;
        const rumble = ctx.createBiquadFilter(); rumble.type = "highpass"; rumble.frequency.value = 85;
        filter.connect(drive).connect(cabinet).connect(rumble).connect(volume).connect(getGraph().input);
      } else filter.connect(volume).connect(getGraph().input);
      oscillators.forEach((oscillator) => {
        oscillator.start(when);
        oscillator.stop(when + duration + profile.release);
      });
      if (voice === "air flute") {
        const vibrato = ctx.createOscillator();
        const vibratoDepth = ctx.createGain();
        vibrato.frequency.value = 5.1;
        vibratoDepth.gain.setValueAtTime(0, when);
        vibratoDepth.gain.linearRampToValueAtTime(7, when + 0.16);
        vibrato.connect(vibratoDepth);
        oscillators.forEach((oscillator) =>
          vibratoDepth.connect(oscillator.detune),
        );
        sources.add(vibrato);
        vibrato.onended = () => sources.delete(vibrato);
        vibrato.start(when);
        vibrato.stop(when + duration + profile.release);
      }
    };
    const createNoiseSample = (
      ctx: AudioContext,
      duration: number,
      decay: number,
    ) => {
      const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * duration),
        ctx.sampleRate,
      );
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index++)
        data[index] =
          (Math.random() * 2 - 1) * Math.exp(-index / (ctx.sampleRate * decay));
      return buffer;
    };
    const cymbalNoise = (
      start: number,
      duration: number,
      gain: number,
      cutoff: number,
      decay: number,
    ) => {
      const ctx = get();
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const volume = ctx.createGain();
      const when = ctx.currentTime + start;
      source.buffer = createNoiseSample(ctx, duration, decay);
      filter.type = "highpass";
      filter.frequency.setValueAtTime(cutoff, when);
      volume.gain.setValueAtTime(gain, when);
      volume.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      source.connect(filter).connect(volume).connect(getGraph().input);
      sources.add(source);
      source.onended = () => sources.delete(source);
      source.start(when);
      source.stop(when + duration);
    };
    const drum = (instrument: DrumInstrument, start = 0, velocity = 1, kit: DrumKit = "current") => {
      const rock = kit === "rock", metal = kit === "prog metal";
      const tail = rock ? 1.5 : metal ? 0.72 : 1;
      if (kit !== "current" && instrument === "kick") cymbalNoise(start, 0.025, velocity * (metal ? 0.09 : 0.04), 2800, 0.007);
      const ctx = get();
      const when = ctx.currentTime + start;
      if (instrument === "kick") {
        const oscillator = ctx.createOscillator();
        const volume = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(metal ? 210 : rock ? 170 : 150, when);
        oscillator.frequency.exponentialRampToValueAtTime(metal ? 51 : rock ? 46 : 43, when + 0.13 * tail);
        volume.gain.setValueAtTime(0.26 * velocity, when);
        volume.gain.exponentialRampToValueAtTime(0.0001, when + 0.18 * tail);
        oscillator.connect(volume).connect(getGraph().input);
        sources.add(oscillator);
        oscillator.onended = () => sources.delete(oscillator);
        oscillator.start(when);
        oscillator.stop(when + 0.19 * tail);
        return;
      }
      if (instrument === "snare") {
        cymbalNoise(start, 0.19 * tail, (rock ? 0.17 : metal ? 0.15 : 0.12) * velocity, metal ? 1800 : rock ? 900 : 1200, 0.055 * tail);
        tone(metal ? 57 : rock ? 50 : 78, start, 0.07 * tail, (rock || metal ? 0.055 : 0.025) * velocity, "click");
        return;
      }
      if (instrument === "tomhigh" || instrument === "tomlow") {
        const oscillator=ctx.createOscillator(), volume=ctx.createGain();
        const pitch=instrument === "tomhigh" ? 180 : 105;
        oscillator.frequency.setValueAtTime(pitch*1.5,when);
        oscillator.frequency.exponentialRampToValueAtTime(pitch,when+.09);
        volume.gain.setValueAtTime(.18*velocity,when);
        volume.gain.exponentialRampToValueAtTime(.0001,when+.32*tail);
        oscillator.connect(volume).connect(getGraph().input); sources.add(oscillator);
        oscillator.onended=()=>sources.delete(oscillator); oscillator.start(when); oscillator.stop(when+.34*tail);
        cymbalNoise(start,.035,.025*velocity,1400,.012); return;
      }
      if (instrument === "openhat") { cymbalNoise(start,.38*tail,.085*velocity,6500,.12*tail); return; }
      if (instrument === "hihat") {
        cymbalNoise(start, 0.13 * tail, 0.085 * velocity, metal ? 8200 : rock ? 5800 : 6800, 0.022 * tail);
        return;
      }
      if (instrument === "crash") {
        cymbalNoise(start, 0.95 * tail, 0.12 * velocity, metal ? 3600 : 2500, 0.32 * tail);
        return;
      }
      cymbalNoise(start, 0.52 * tail, 0.075 * velocity, metal ? 5200 : 4200, 0.16 * tail);
      tone(82, start, 0.17, 0.014 * velocity, "click");
    };
    const diagnostics = () => {
      const { context, analyser } = getGraph();
      const samples = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(samples);
      return {
        state: context.state,
        peak: samples.reduce(
          (maximum, sample) => Math.max(maximum, Math.abs(sample - 128)),
          0,
        ),
        activeSources: sources.size,
      };
    };
    const stopAll = () => {
      sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      });
      sources.clear();
    };
    return { tone, drum, get, unlock, diagnostics, stopAll };
  }, []);
}

function scheduleClickTrack(
  engine: ReturnType<typeof useAudioEngine>,
  beats: number,
  beatSeconds: number,
  meter: string,
  startSeconds = 0,
) {
  const beatsPerBar = Number(meter.split("/")[0]) || 4;
  for (let beat = 0; beat < beats; beat++) {
    const accented = beat % beatsPerBar === 0;
    engine.tone(
      accented ? 88 : 80,
      startSeconds + beat * beatSeconds,
      0.04,
      accented ? 0.11 : 0.055,
      "click",
    );
  }
}

function playChord(
  engine: ReturnType<typeof useAudioEngine>, symbol: string, start: number,
  duration: number, gain = .045, voice: SynthVoice = "warm pad", pitches?: number[],
) {
  const notes = pitches ?? decodeVoicing(symbol);
  notes.forEach((pitch,index) => engine.tone(pitch,start+index*.014,Math.max(.1,duration-index*.014),gain*(index===0?.72:1),voice));
}

function fitMelodyToChords<
  T extends {
    pitch: number;
    note: string;
    start: number;
    duration: number;
    velocity: number;
  },
>(melody: T[], chords: ChordDraft[]) {
  const totalBeats = chords.reduce((sum, chord) => sum + chord.beats, 0);
  if (!totalBeats || !chords.length) return melody;
  return melody.map((note) => {
    const beat = ((note.start % totalBeats) + totalBeats) % totalBeats;
    const onStrongBeat = Math.abs(beat - Math.round(beat)) < 0.08;
    let cursor = 0;
    let chordStart = 0;
    const chord =
      chords.find((item) => {
        chordStart = cursor;
        cursor += item.beats;
        return beat < cursor;
      }) ?? chords[chords.length - 1];
    const rootPitch = notePitchClass(chord.name);
    if (rootPitch === null) return note;
    const intervals = chordIntervals(chord.name);
    const pitchClasses = new Set(intervals.map((interval) => (rootPitch + interval) % 12));
    const relativePitch = ((note.pitch-rootPitch)%12+12)%12;
    const sustainedDissonance = note.duration >= .75 && [1,6,11].includes(relativePitch);
    if (!onStrongBeat && !sustainedDissonance) return note;
    if (pitchClasses.has(((note.pitch%12)+12)%12)) return note;
    const atChordChange = Math.abs(beat-chordStart)<.08;
    const candidates = Array.from({length:25},(_,index)=>note.pitch+index-12).filter(pitch=>pitchClasses.has(((pitch%12)+12)%12));
    const fittedPitch = candidates.sort((a,b) => {
      const score = (pitch:number) => Math.abs(pitch-note.pitch) + (!atChordChange && pitch%12===rootPitch ? 1.5 : 0);
      return score(a)-score(b);
    })[0] ?? note.pitch;
    return { ...note, pitch: fittedPitch, note: midiNoteName(fittedPitch) };
  });
}

function fitMelodyToSection<
  T extends { pitch:number; note:string; start:number; duration:number; velocity:number },
>(melody:T[],chords:ChordDraft[],section?:SongSection) {
  const fitted=fitMelodyToChords(melody,chords);
  const accompaniment=(section?.ideas ?? []).filter(item=>item.type==="bass"||item.type==="riff").flatMap(item=>(item.data ?? []).map(value=>Number(value.split("|")[0])).filter(Number.isFinite));
  if(!accompaniment.length || !fitted.length) return fitted;
  const accompanimentTop=Math.max(...accompaniment);
  const melodyAverage=fitted.reduce((sum,note)=>sum+note.pitch,0)/fitted.length;
  const lift=melodyAverage-accompanimentTop<9 ? 12 : 0;
  return fitted.map(note=>lift && note.pitch+12<=96 ? {...note,pitch:note.pitch+12,note:midiNoteName(note.pitch+12)} : note);
}

function playDrumLoop(
  engine: ReturnType<typeof useAudioEngine>,
  hits: DrumHit[],
  startBeat: number,
  bars: number,
  beatsPerBar: number,
  beatSeconds: number,
  kit: DrumKit = "current",
) {
  for (let bar = 0; bar < bars; bar++)
    hits.forEach((hit) =>
      engine.drum(
        hit.instrument,
        (startBeat + bar * beatsPerBar + hit.step / 4) * beatSeconds,
        hit.velocity,
        kit,
      ),
    );
}


function playRiff(
  engine: ReturnType<typeof useAudioEngine>,
  riff: RiffEvent[],
  startBeat: number,
  beatSeconds: number,
  voice: SynthVoice = "analog pulse",
) {
  riff.forEach((note) =>
    engine.tone(
      note.pitch,
      (startBeat + note.start) * beatSeconds,
      note.duration * beatSeconds,
      note.muted ? 0.027 : note.accent ? 0.065 : 0.04,
      voice,
    ),
  );
}


function useLoopTransport(
  playOnce: () => void,
  durationMs: number,
  stopAudio: () => void,
  unlockAudio: () => Promise<boolean>,
) {
  const [mode, setMode] = useState<"stopped" | "once" | "loop">("stopped");
  const timer = useRef<number | null>(null);
  const startGeneration = useRef(0);
  const playRef = useRef(playOnce);
  const durationRef = useRef(durationMs);
  useEffect(() => {
    playRef.current = playOnce;
    durationRef.current = durationMs;
  }, [playOnce, durationMs]);
  const clear = useCallback(() => {
    startGeneration.current++;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    stopAudio();
  }, [stopAudio]);
  const stop = useCallback(() => {
    clear();
    setMode("stopped");
  }, [clear]);
  const start = useCallback(
    async (loop: boolean) => {
      clear();
      window.dispatchEvent(new Event("inspitivity-solo-preview"));
      const token=++startGeneration.current;
      const unlocked = await unlockAudio();
      if(token !== startGeneration.current) return;
      if (!unlocked) {
        setMode("stopped");
        return;
      }
      setMode(loop ? "loop" : "once");
      const run = () => {
        playRef.current();
        timer.current = window.setTimeout(
          () => (loop ? run() : setMode("stopped")),
          Math.max(120, durationRef.current),
        );
      };
      run();
    },
    [clear, unlockAudio],
  );
  useEffect(() => { window.addEventListener("inspitivity-context-play",stop); return () => { window.removeEventListener("inspitivity-context-play",stop); clear(); }; }, [clear,stop]);
  return { mode, start, stop };
}

export default function InspitivityApp({ account, signOutPath }: {
  account: { userId: string; displayName: string; email: string };
  signOutPath: string;
}) {
  const [projects, setProjects, cloud] = useCloudProjects(STARTER_PROJECTS, account.userId);
  const [theme, setTheme] = useTheme();
  const [previews, setPreviews] = useState<Record<string, DraftPreview>>({});
  const phoneInstall = usePhoneInstall();
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedId, setSelectedId] = useState("midnight");
  const [modal, setModal] = useState<"project" | "create" | "record" | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [pendingSave, setPendingSave] = useState<IdeaDraft | null>(null);
  const savedDraftId = useRef<string | null>(null);
  const [draftSectionId, setDraftSectionId] = useState<string | null>(null);
  const [returnToArrangement, setReturnToArrangement] = useState(false);
  const [toolMetronomeEnabled, setToolMetronomeEnabled] = useState(false);
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];
  const publishPreview = useCallback((preview: DraftPreview) => {
    const key = `${selected?.id}/${draftSectionId ?? "scratch"}/${preview.type}`;
    setPreviews(current => JSON.stringify(current[key]) === JSON.stringify(preview) ? current : { ...current, [key]: preview });
  }, [selected?.id, draftSectionId]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  const navigate = (next: Screen) => {
    if (next !== screen) {
      setEditingIdea(selected?.sections.find(s => s.id === draftSectionId)?.ideas.find(i => i.type === next) ?? null);
      savedDraftId.current = null;
    }
    if (!["chords", "melody", "drums", "bass", "riff", "transition", "metronome"].includes(next))
      { setReturnToArrangement(false); setDraftSectionId(null); }
    setScreen(next);
  };
  const openProject = (id: string) => {
    setSelectedId(id);
    navigate("project");
  };
  const createProject = (name: string, bpm: number, key: string) => {
    const project: Project = {
      id: uid(),
      name,
      bpm,
      meter: "4/4",
      key,
      updated: Date.now(),
      sections: [
        { id: uid(), name: "Verse", bars: 8, color: "mint", ideas: [] },
        { id: uid(), name: "Chorus", bars: 8, color: "violet", ideas: [] },
      ],
    };
    setProjects((p) => [project, ...p]);
    setSelectedId(project.id);
    setModal(null);
    setScreen("project");
  };
  const confirmDeleteProject = () => {
    if (!projectToDelete) return;
    const remaining = projects.filter(
      (project) => project.id !== projectToDelete.id,
    );
    setProjects(remaining);
    if (selectedId === projectToDelete.id) {
      setSelectedId(remaining[0]?.id ?? "");
      setScreen("projects");
    }
    notify(`Deleted ${projectToDelete.name}`);
    setProjectToDelete(null);
  };
  const launchSketch = (preset: SketchPreset) => {
    const project = buildPlayableSketch(preset);
    setProjects((items) => [project, ...items]);
    setSelectedId(project.id);
    setScreen("project");
    notify(`${preset.label} sketch is ready to play`);
  };
  const updateSelected = useCallback(
    (fn: (project: Project) => Project) =>
      setProjects((items) =>
        items.map((p) =>
          p.id === selectedId ? { ...fn(p), updated: Date.now() } : p,
        ),
      ),
    [selectedId, setProjects],
  );
  const saveIdea = (
    type: Idea["type"],
    name: string,
    detail: string,
    data?: string[],
    chooseDestination = false,
    voice?: string,
  ) => {
    if (!selected) return;
    if (chooseDestination) {
      setPendingSave({ type, name, detail, data, voice });
      return;
    }
    const existingId = editingIdea?.type === type ? editingIdea.id : savedDraftId.current;
    if (existingId) {
      updateSelected((project) => ({
        ...project,
        sections: project.sections.map((section) => ({
          ...section,
          ideas: section.ideas.map((idea) =>
            idea.id === existingId
              ? { ...idea, type, name, detail, data, voice }
              : idea,
          ),
        })),
      }));
      window.dispatchEvent(new Event("inspitivity-draft-saved"));
      notify(`Saved changes to ${name}`);
      return;
    }
    const destination = selected.sections.find(
      (section) => section.id === draftSectionId,
    );
    if (!destination) {
      setPendingSave({ type, name, detail, data, voice });
      return;
    }
    const newId = uid();
    savedDraftId.current = newId;
    updateSelected((project) => ({
      ...project,
      sections: project.sections.map((section) =>
        section.id === destination.id
          ? {
              ...section,
              ideas: [
                ...section.ideas,
                { id: newId, type, name, detail, data, voice },
              ],
            }
          : section,
      ),
    }));
    window.dispatchEvent(new Event("inspitivity-draft-saved"));
    notify(`Saved to ${selected.name} · ${destination.name}`);
  };
  const saveIdeaTo = (projectId: string, sectionId: string) => {
    if (!pendingSave) return;
    const project = projects.find((item) => item.id === projectId);
    const section = project?.sections.find((item) => item.id === sectionId);
    if (!project || !section) return;
    const draft = pendingSave;
    setProjects((items) =>
      items.map((item) =>
        item.id === projectId
          ? {
              ...item,
              updated: Date.now(),
              sections: item.sections.map((target) =>
                target.id === sectionId
                  ? {
                      ...target,
                      ideas: [...target.ideas, { id: uid(), ...draft }],
                    }
                  : target,
              ),
            }
          : item,
      ),
    );
    setPendingSave(null);
    window.dispatchEvent(new Event("inspitivity-draft-saved"));
    notify(`Saved to ${project.name} · ${section.name}`);
  };
  const openSectionTool = (
    sectionId: string,
    tool: "chords" | "melody" | "drums" | "bass" | "riff" | "transition",
  ) => {
    savedDraftId.current = null;
    setEditingIdea(selected?.sections.find(s => s.id === sectionId)?.ideas.find(i => i.type === tool) ?? null);
    setDraftSectionId(sectionId);
    setReturnToArrangement(true);
    setScreen(tool);
  };
  const backFromMusicTool = () => {
    savedDraftId.current = null;
    const destination = returnToArrangement ? "project" : "home";
    setEditingIdea(null);
    setDraftSectionId(null);
    setReturnToArrangement(false);
    setScreen(destination);
  };
  const editArrangementIdea = (sectionId: string, idea: Idea) => {
    savedDraftId.current = null;
    if (
      idea.type === "chords" ||
      idea.type === "melody" ||
      idea.type === "drums" ||
      idea.type === "bass" ||
      idea.type === "riff" ||
      idea.type === "transition"
    ) {
      setDraftSectionId(sectionId);
      setEditingIdea(idea);
      setReturnToArrangement(true);
      setScreen(idea.type);
    }
  };
  const musicProject = useMemo(() => selected ? ({ ...selected, sections: selected.sections.map((section, index) => {
    const scope = draftSectionId ?? "scratch";
    if (draftSectionId ? section.id !== draftSectionId : index !== 0) return section;
    const ideas = [...section.ideas];
    for (const type of ["chords", "melody", "drums", "bass", "riff"] as const) {
      const preview = previews[`${selected.id}/${scope}/${type}`];
      if (!preview) continue;
      const i=ideas.findIndex(idea=>idea.type===type);
      const draft: Idea={ id:`context-${type}`, type, name:`${type} draft`, detail:"", data:preview.data, voice:preview.voice };
      if(i>=0) ideas[i]=draft; else ideas.push(draft);
    }
    return { ...section, ideas };
  }) }) : undefined, [selected, previews, draftSectionId]);
  const draftSection = musicProject?.sections.find(
    (section) => section.id === draftSectionId,
  );
  const draftSectionIndex =
    draftSection && selected
      ? selected.sections.findIndex((section) => section.id === draftSection.id)
      : -1;

  return (
    <main className={`app-shell ${screen}-screen ${returnToArrangement ? "inside-project" : ""}`}>
      <div className="studio-workspace">
      <div className="sync-status">
        <div className="account-sync"><b>{account.displayName}</b><span role="status">{cloud.status}</span></div>
        <div className="account-actions"><button onClick={() => void cloud.sync()}>Sync now</button><a href={signOutPath} target="_top">Sign out</a></div>
      </div>
      {selected && returnToArrangement && ["drums", "chords", "melody", "bass", "riff", "metronome"].includes(screen) && <SharedSectionPlayer project={selected} previews={previews} activeSectionId={draftSectionId} chooseSection={(id) => { setDraftSectionId(id); setEditingIdea(null); }} updateProject={updateSelected} />}
      <DraftSession key={`${selected?.id}/${draftSectionId ?? "scratch"}/${screen}/${editingIdea?.id ?? "new"}`} id={`${selected?.id}/${draftSectionId ?? "scratch"}/${screen}/${editingIdea?.id ?? "new"}`} publish={publishPreview}>
      {screen === "home" && (
        <Home
          projects={projects}
          openProject={openProject}
          go={navigate}
          create={() => setModal("create")}
          record={() => setModal("record")}
          launchSketch={launchSketch}
        />
      )}
      {screen === "projects" && (
        <Projects
          projects={projects}
          openProject={openProject}
          create={() => setModal("project")}
          deleteProject={setProjectToDelete}
        />
      )}
      {screen === "project" && selected && (
        <ProjectView
          project={selected}
          update={updateSelected}
          back={() => navigate("projects")}
          record={() => setModal("record")}
          openSectionTool={openSectionTool}
          editIdea={editArrangementIdea}
          deleteProject={() => setProjectToDelete(selected)}
          clearAssetDraft={(sectionId,idea,removeDraft=false) => {
            window.dispatchEvent(new Event("inspitivity-solo-preview"));
            setPreviews(current=>Object.fromEntries(Object.entries(current).filter(([key])=>key!==`${selected.id}/${sectionId}/${idea.type}` && key!==`${selected.id}/scratch/${idea.type}`)));
            if(removeDraft) for(const suffix of ["new",idea.id]) {
              try { localStorage.removeItem(`inspitivity-draft-v1:${selected.id}/${sectionId}/${idea.type}/${suffix}`); } catch { /* device storage unavailable */ }
            }
          }}
        />
      )}
      {screen === "chords" && selected && (
        <ChordTool
          key={`${editingIdea?.id ?? "new-chords"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "chords" ? editingIdea : undefined}
          project={musicProject ?? selected}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateSelected}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "melody" && selected && (
        <MelodyTool
          key={`${editingIdea?.id ?? "new-melody"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "melody" ? editingIdea : undefined}
          project={musicProject ?? selected}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateSelected}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "drums" && selected && (
        <DrumTool
          key={`${editingIdea?.id ?? "new-drums"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "drums" ? editingIdea : undefined}
          project={musicProject ?? selected}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateSelected}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "bass" && selected && (
        <BassTool
          key={`${editingIdea?.id ?? "new-bass"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "bass" ? editingIdea : undefined}
          project={musicProject ?? selected}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateSelected}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "riff" && selected && (
        <RiffTool
          key={`${editingIdea?.id ?? "new-riff"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "riff" ? editingIdea : undefined}
          project={musicProject ?? selected}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateSelected}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "transition" && selected && (
        <TransitionTool
          key={`${editingIdea?.id ?? "new-transition"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "transition" ? editingIdea : undefined}
          project={selected}
          section={draftSection}
          updateProject={updateSelected}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
        />
      )}
      {screen === "metronome" && selected && (
        <Metronome
          project={selected}
          updateProject={updateSelected}
          back={backFromMusicTool}
          go={navigate}
        />
      )}
      {screen === "settings" && (
        <Settings
          projects={projects}
          theme={theme}
          setTheme={setTheme}
          phoneInstall={phoneInstall}
          notify={notify}
          backUp={async () => {
            try { await downloadBackup(projects); notify("Complete backup downloaded, including recordings"); }
            catch (error) { notify(error instanceof Error ? error.message : "Backup failed"); }
          }}
          restore={async (file) => {
            try { const restored = await restoreBackup(file); setProjects(items => [...restored, ...items]); notify("Backup restored as copies; existing projects are unchanged"); }
            catch (error) { notify(error instanceof Error ? error.message : "Restore failed"); }
          }}
          syncStatus={cloud.status}
        />
      )}
      </DraftSession>
      </div>
      <BottomNav
        screen={screen}
        go={navigate}
        create={() => setModal("create")}
      />
      {modal === "project" && (
        <ProjectModal close={() => setModal(null)} submit={createProject} />
      )}
      {modal === "create" && (
        <CreateModal
          close={() => setModal(null)}
          choose={(action) => {
            setModal(null);
            if (action === "project") setModal("project");
            else if (action === "record") setModal("record");
            else navigate(action);
          }}
        />
      )}
      {modal === "record" && selected && (
        <RecorderModal
          project={selected}
          close={() => setModal(null)}
          attach={(sectionId, idea) => {
            updateSelected((p) => ({
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId ? { ...s, ideas: [...s.ideas, idea] } : s,
              ),
            }));
            notify("Recording saved locally");
          }}
        />
      )}
      {pendingSave && (
        <SaveDestinationModal
          projects={projects}
          defaultProjectId={selected?.id ?? projects[0]?.id ?? ""}
          idea={pendingSave}
          close={() => setPendingSave(null)}
          save={saveIdeaTo}
        />
      )}
      {projectToDelete && (
        <ConfirmProjectDelete
          project={projectToDelete}
          close={() => setProjectToDelete(null)}
          confirm={confirmDeleteProject}
        />
      )}
      {toast && (
        <div className="toast">
          <span>✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}

function Home({
  projects,
  openProject,
  go,
  create,
  record,
  launchSketch,
}: {
  projects: Project[];
  openProject: (id: string) => void;
  go: (s: Screen) => void;
  create: () => void;
  record: () => void;
  launchSketch: (preset: SketchPreset) => void;
}) {
  const [presetId, setPresetId] = useState<SketchPreset["id"]>("neo-soul");
  const preset =
    SKETCH_PRESETS.find((candidate) => candidate.id === presetId) ??
    SKETCH_PRESETS[0];
  return (
    <>
      <Topbar
        title="Your studio"
        subtitle="Capture a spark. Shape a song."
        onCreate={create}
      />
      <section className="spark-studio">
        <div className="spark-heading">
          <div>
            <p className="eyebrow">Start with musical context</p>
            <h2>What should the idea feel like?</h2>
          </div>
          <button className="record-now" onClick={record}>
            <b>●</b>
            <span>Record now</span>
          </button>
        </div>
        <div className="preset-grid" role="radiogroup" aria-label="Sketch direction">
          {SKETCH_PRESETS.map((candidate) => (
            <button
              key={candidate.id}
              className={candidate.id === preset.id ? "active" : ""}
              role="radio"
              aria-checked={candidate.id === preset.id}
              onClick={() => setPresetId(candidate.id)}
            >
              <b>{candidate.accent}</b>
              <span>{candidate.label}</span>
              <small>{candidate.copy}</small>
            </button>
          ))}
        </div>
        <div className="sketch-launcher">
          <div className="sketch-spec">
            <span>{formatProjectKey(preset.root, preset.mode)}</span>
            <span>{preset.bpm} BPM</span>
            <span>{preset.meter}</span>
          </div>
          <button
            className="primary-button"
            onClick={() => launchSketch(preset)}
          >
            Build playable sketch <span>＋</span>
          </button>
        </div>
        <p className="sketch-note">
          Creates a varied song form with connected chords, bass, motif and drums.
        </p>
      </section>
      <SectionTitle
        eyebrow="Pick up where you left off"
        title="Recent projects"
        action="View all"
        onAction={() => go("projects")}
      />
      <div className="project-grid">
        {projects.slice(0, 3).map((p, i) => (
          <button
            className={`project-card ${COLORS[i % COLORS.length]}`}
            key={p.id}
            onClick={() => openProject(p.id)}
          >
            <Wave tone={COLORS[i % COLORS.length]} />
            <span>
              {p.sections.length} sections · {p.bpm} BPM
            </span>
            <h4>{p.name}</h4>
            <p>
              {p.key} · {p.meter}
            </p>
          </button>
        ))}
        <button className="new-project-card" onClick={create}>
          <b>+</b>
          <span>New project</span>
        </button>
      </div>
    </>
  );
}

function SectionTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h3>{title}</h3>
      </div>
      {action && <button onClick={onAction}>{action}</button>}
    </section>
  );
}
function ToolButton({
  tone,
  icon,
  title,
  copy,
  onClick,
}: {
  tone: string;
  icon: string;
  title: string;
  copy: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick}>
      <span className={`tool-icon ${tone}`}>{icon}</span>
      <div>
        <b>{title}</b>
        <small>{copy}</small>
      </div>
      <i>→</i>
    </button>
  );
}

function Projects({
  projects,
  openProject,
  create,
  deleteProject,
}: {
  projects: Project[];
  openProject: (id: string) => void;
  create: () => void;
  deleteProject: (project: Project) => void;
}) {
  return (
    <>
      <Topbar title="Projects" subtitle="Your songbook" onCreate={create} />
      <div className="projects-toolbar">
        <p>{projects.length} works in progress</p>
        <button>Recently edited ↓</button>
      </div>
      <div className="projects-list">
        {projects.map((p, index) => (
          <article className="project-row" key={p.id}>
            <button className="project-open" onClick={() => openProject(p.id)}>
              <span className={`project-avatar ${COLORS[index % COLORS.length]}`}>
                <Wave tone={COLORS[index % COLORS.length]} bars={5} />
              </span>
              <div>
                <h3>{p.name}</h3>
                <p>
                  {p.sections.length} sections · {p.bpm} BPM · {p.key}
                </p>
                <div className="mini-arrangement">
                  {p.sections.map((s) => (
                    <i key={s.id} style={{ flex: s.bars }} />
                  ))}
                </div>
              </div>
              <b>→</b>
            </button>
            <button
              className="project-delete-button"
              onClick={() => deleteProject(p)}
              aria-label={`Delete ${p.name}`}
              title={`Delete ${p.name}`}
            >
              <TrashIcon />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function TrashIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg>;
}
const SECTION_ASSETS = [
  ["drums", "Drums", "▦"], ["chords", "Chords", "♯"],
  ["bass", "Bass", "♭"], ["melody", "Melody", "♥"], ["riff", "Pattern", "⇶"], ["transition", "Transition", "⇄"],
] as const;
type UndoRemoval =
  | { kind:"section"; label:string; section:SongSection; index:number }
  | { kind:"idea"; label:string; idea:Idea; sectionId:string; index:number };

function ProjectView({
  project,
  update,
  back,
  record,
  openSectionTool,
  editIdea,
  deleteProject,
  clearAssetDraft,
}: {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  back: () => void;
  record: () => void;
  openSectionTool: (
    sectionId: string,
    tool: "chords" | "melody" | "drums" | "bass" | "riff" | "transition",
  ) => void;
  editIdea: (sectionId: string, idea: Idea) => void;
  deleteProject: () => void;
  clearAssetDraft: (sectionId: string, idea: Idea, removeDraft?: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [ideaSection, setIdeaSection] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [renamingSectionId,setRenamingSectionId]=useState<string|null>(null);
  const [sectionRename,setSectionRename]=useState("");
  const [undoRemoval,setUndoRemoval]=useState<UndoRemoval|null>(null);
  const [arrangementPlaying, setArrangementPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [countIn, setCountIn] = useState(false);
  const [arrangementClick, setArrangementClick] = useState(false);
  const [loopArrangement, setLoopArrangement] = useState(false);
  const [audioStatus, setAudioStatus] = useState<string | null>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(
    null,
  );
  const [playingIdeaId, setPlayingIdeaId] = useState<string | null>(null);
  const arrangementTimer = useRef<number | null>(null);
  const playbackTimer = useRef<number | null>(null);
  const loopArrangementRef = useRef(false);
  const sectionTimers = useRef<number[]>([]);
  const ideaTimer = useRef<number | null>(null);
  const ideaAudio = useRef<HTMLAudioElement | null>(null);
  const engine = useAudioEngine();
  useEffect(() => { loopArrangementRef.current = loopArrangement; }, [loopArrangement]);
  const move = (index: number, direction: number) =>
    update((p) => {
      const sections = [...p.sections];
      const target = index + direction;
      if (target < 0 || target >= sections.length) return p;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...p, sections };
    });
  const stopArrangement = useCallback(() => {
    if (arrangementTimer.current) window.clearTimeout(arrangementTimer.current);
    arrangementTimer.current = null;
    if (playbackTimer.current) window.clearInterval(playbackTimer.current);
    playbackTimer.current = null;
    sectionTimers.current.forEach((timer) => window.clearTimeout(timer));
    sectionTimers.current = [];
    engine.stopAll();
    setArrangementPlaying(false);
    setActiveSectionIndex(null);
    setPlaybackSeconds(0);
  }, [engine]);
  const stopIdea = useCallback(() => {
    if (ideaTimer.current) window.clearTimeout(ideaTimer.current);
    ideaTimer.current = null;
    engine.stopAll();
    if (ideaAudio.current) {
      ideaAudio.current.pause();
      ideaAudio.current.currentTime = 0;
      ideaAudio.current = null;
    }
    setPlayingIdeaId(null);
  }, [engine]);
  const removeSection = (sectionId: string) => {
    if (project.sections.length === 1) return;
    const index=project.sections.findIndex(section=>section.id===sectionId);
    const removed=project.sections[index];
    if(!removed)return;
    removed.ideas.forEach(idea=>clearAssetDraft(sectionId,idea,true));
    stopArrangement();
    stopIdea();
    setUndoRemoval({kind:"section",label:removed.name,section:removed,index});
    update((p) => ({
      ...p,
      sections: p.sections.filter((section) => section.id !== sectionId),
    }));
  };
  const removeIdea = (sectionId: string, ideaId: string) => {
    stopArrangement(); stopIdea();
    const sourceSection=project.sections.find(s=>s.id===sectionId);
    const index=sourceSection?.ideas.findIndex(i=>i.id===ideaId)??-1;
    const removed=index>=0?sourceSection?.ideas[index]:undefined;
    if(removed)clearAssetDraft(sectionId,removed,true);
    if(removed)setUndoRemoval({kind:"idea",label:removed.name,idea:removed,sectionId,index});
    update((p) => ({
      ...p,
      sections: p.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              ideas: section.ideas.filter((idea) => idea.id !== ideaId),
            }
          : section,
      ),
    }));
  };
  const restoreRemoval=()=>{
    if(!undoRemoval)return;
    stopArrangement();stopIdea();
    update(p=>{
      if(undoRemoval.kind==="section") {
        if(p.sections.some(section=>section.id===undoRemoval.section.id))return p;
        const sections=[...p.sections];sections.splice(Math.min(undoRemoval.index,sections.length),0,undoRemoval.section);return {...p,sections};
      }
      return {...p,sections:p.sections.map(section=>{
        if(section.id!==undoRemoval.sectionId||section.ideas.some(idea=>idea.id===undoRemoval.idea.id))return section;
        const ideas=[...section.ideas];ideas.splice(Math.min(undoRemoval.index,ideas.length),0,undoRemoval.idea);return {...section,ideas};
      })};
    });
    setUndoRemoval(null);
  };
  const beginRename=(section:SongSection)=>{setRenamingSectionId(section.id);setSectionRename(section.name);};
  const commitRename=(sectionId:string)=>{
    const name=sectionRename.trim();
    if(name)update(p=>({...p,sections:p.sections.map(section=>section.id===sectionId?{...section,name}:section)}));
    setRenamingSectionId(null);
  };
  const cycleSectionMeter = (sectionId: string, barIndex: number) =>
    update((p) => ({
      ...p,
      sections: p.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const map = sectionMeterMap(section, p.meter);
        map[barIndex] = nextProgMeter(map[barIndex]);
        return { ...section, meterMap: map };
      }),
    }));
  const setSectionBars = (sectionId: string, bars: number) =>
    update((p) => ({
      ...p,
      sections: p.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const currentMap = sectionMeterMap(section, p.meter);
        return {
          ...section,
          bars,
          meterMap: Array.from({ length: bars }, (_, index) => currentMap[index] ?? p.meter),
        };
      }),
    }));
  const updateSectionMix = (
    sectionId: string,
    layer: SongLayer,
    settings: Partial<TrackMix>,
  ) => {
    stopArrangement();
    update((p) => ({
      ...p,
      sections: p.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              mix: {
                ...section.mix,
                [layer]: { ...sectionMix(section)[layer], ...settings },
              },
            }
          : section,
      ),
    }));
  };
  const autoBalanceSection = (sectionId: string) => {
    stopArrangement();
    update((p) => ({ ...p, sections:p.sections.map((section) => section.id === sectionId ? { ...section, mix:automaticSectionMix(section) } : section) }));
  };
  const autoBalanceAll = () => {
    stopArrangement();
    update((p) => ({ ...p, sections:p.sections.map((section) => ({ ...section, mix:automaticSectionMix(section) })) }));
  };
  const setSectionRepeats = (sectionId: string, repeats: number) => {
    stopArrangement();
    update((p) => ({ ...p, sections:p.sections.map((section) => section.id === sectionId ? { ...section, repeats } : section) }));
  };
  const setSectionEnergy = (sectionId: string, energy: SectionEnergy) => {
    stopArrangement();
    update((p) => ({ ...p, sections:p.sections.map((section) => section.id === sectionId ? { ...section, energy, mix:automaticSectionMix({ ...section, energy }) } : section) }));
  };
  const duplicateSection = (sectionId: string, variation: boolean) => update((p) => {
    const index = p.sections.findIndex((section) => section.id === sectionId);
    if (index < 0) return p;
    const source = p.sections[index];
    const varyData = (idea: Idea) => !variation || !idea.data ? idea.data : varyIdeaData(idea.type,idea.data,Date.now()+idea.id.length);
    const copy: SongSection = { ...source, id:uid(), name:variation ? `${source.name} variation` : `${source.name} copy`, repeats:1, ideas:source.ideas.map((idea)=>({ ...idea,id:uid(),name:variation?`${idea.name} variation`:idea.name,data:varyData(idea) })) };
    const sections=[...p.sections]; sections.splice(index+1,0,copy); return { ...p,sections };
  });
  const createSectionReturn=(sectionId:string)=>update(p=>{
    const source=p.sections.find(section=>section.id===sectionId);
    if(!source)return p;
    const returned:SongSection={...source,id:uid(),name:`${source.name} return`,repeats:1,meterMap:source.meterMap?[...source.meterMap]:undefined,mix:source.mix?JSON.parse(JSON.stringify(source.mix)):undefined,ideas:source.ideas.map(idea=>({...idea,id:uid(),name:`${idea.name} return`,data:idea.data?[...idea.data]:undefined}))};
    return {...p,sections:[...p.sections,returned]};
  });
  const shapeEnergyArc=()=>update(p=>({...p,sections:p.sections.map((section,index)=>{
    const energy:SectionEnergy=index===0?"mellow":index===p.sections.length-1?"powerful":"balanced";
    const next={...section,energy};return {...next,mix:automaticSectionMix(next)};
  })}));
  const applyArrangementInsight=(insight:ArrangementInsight)=>{
    if(insight.action==="add_section")setAdding(true);
    if(insight.action==="create_return"&&insight.sectionId)createSectionReturn(insight.sectionId);
    if(insight.action==="shape_energy")shapeEnergyArc();
    if(insight.action==="add_foundation"&&insight.sectionId&&insight.tool)openSectionTool(insight.sectionId,insight.tool);
  };
  const playSavedSections = async (sections: SongSection[], firstIndex: number, skipCountIn = false) => {
    window.dispatchEvent(new Event("inspitivity-solo-preview"));
    stopArrangement(); stopIdea();
    if (!(await engine.unlock())) { setAudioStatus("Audio blocked by this browser"); return; }
    const plan=buildSongPlan({...project,sections});
    if(!plan.events.length) { setAudioStatus("Create a drum, bass, chord, melody or pattern asset to hear this section."); return; }
    const countInBeats = countIn && !skipCountIn ? meterBeats(project.meter) : 0;
    const countInSeconds = countInBeats * beatDurationSeconds(project.bpm);
    if (countInBeats) scheduleClickTrack(engine,countInBeats,beatDurationSeconds(project.bpm),project.meter);
    if (arrangementClick) scheduleClickTrack(engine,Math.ceil(plan.seconds/beatDurationSeconds(project.bpm)),beatDurationSeconds(project.bpm),project.meter,countInSeconds);
    for(const event of plan.events) {
      const mix = sectionMix(sections.find((section) => section.id === event.sectionId));
      const settings = mix[event.layer];
      const hasSolo = Object.values(mix).some((layer) => layer.solo);
      if (settings.muted || (hasSolo && !settings.solo) || settings.volume <= 0) continue;
      if(event.layer === "drums") {
        const instrument=Object.entries(DRUM_PITCHES).find(([,pitch])=>pitch===event.pitch)?.[0] as DrumInstrument | undefined;
        if(instrument)engine.drum(instrument,event.seconds+countInSeconds,event.velocity*settings.volume*.9,(event.voice as DrumKit)||"current");
      } else {
        const baseGain = event.layer === "chords" ? .052 : event.layer === "melody" ? .058 : event.layer === "bass" ? .065 : .055;
        engine.tone(event.pitch,event.seconds+countInSeconds,event.secondsDuration,baseGain*event.velocity*settings.volume,(event.voice as SynthVoice)||(event.layer === "chords" ? "warm pad" : event.layer === "melody" ? "air flute" : event.layer === "bass" ? "deep bass" : "analog pulse"));
      }
    }
    let offset=0;
    sections.forEach((section,index)=>{
      const sectionIndex=firstIndex+index;
      for(let repeat=0;repeat<(section.repeats??1);repeat++) {
        sectionTimers.current.push(window.setTimeout(()=>setActiveSectionIndex(sectionIndex),(offset+countInSeconds)*1000));
        offset+=sectionBeatTotal(section,project.meter)*beatDurationSeconds(project.bpm);
      }
    });
    const startedAt=performance.now()+countInSeconds*1000;
    playbackTimer.current=window.setInterval(()=>setPlaybackSeconds(Math.max(0,(performance.now()-startedAt)/1000)),50);
    setArrangementPlaying(true);setActiveSectionIndex(countInSeconds ? null : firstIndex);
    setAudioStatus(countInSeconds ? `Count-in · ${countInBeats} beats` : "Playing saved assets · empty parts stay silent");
    if(countInSeconds) sectionTimers.current.push(window.setTimeout(()=>setAudioStatus("Playing saved assets · empty parts stay silent"),countInSeconds*1000));
    arrangementTimer.current=window.setTimeout(()=>{
      if(loopArrangementRef.current) void playSavedSections(sections,firstIndex,true);
      else { stopArrangement();setAudioStatus(null); }
    },(plan.seconds+countInSeconds)*1000);
  };
  const playArrangement = async () => {
    if(arrangementPlaying) { stopArrangement(); return; }
    await playSavedSections(project.sections,0);
  };
  const playSection = async (section: SongSection, index: number) => {
    if(arrangementPlaying && activeSectionIndex===index) { stopArrangement(); return; }
    await playSavedSections([section],index);
  };
  useEffect(() => {
    const stop = () => { stopArrangement(); stopIdea(); };
    window.addEventListener("inspitivity-context-play", stop);
    return () => { window.removeEventListener("inspitivity-context-play", stop); stop(); };
  }, [stopArrangement, stopIdea]);
  const playIdea = async (idea: Idea) => {
    window.dispatchEvent(new Event("inspitivity-solo-preview"));
    if (playingIdeaId === idea.id) {
      stopIdea();
      return;
    }
    stopArrangement();
    stopIdea();
    if (!(await engine.unlock())) return;
    const beat = beatDurationSeconds(project.bpm);
    const beatsPerBar = Number(project.meter.split("/")[0]) || 4;
    setPlayingIdeaId(idea.id);
    const finishAt = (durationMs: number) => {
      ideaTimer.current = window.setTimeout(
        () => {
          ideaTimer.current = null;
          setPlayingIdeaId(null);
        },
        Math.max(80, durationMs),
      );
    };
    if (idea.type === "chords") {
      let start = 0;
      (idea.data?.length ? idea.data : idea.detail.split(" · ")).forEach(
        (value) => {
          const [name, savedBeats, savedPitches] = value.split("|");
          const beats = Number(savedBeats) || 4;
          playChord(
            engine,
            name,
            start * beat,
            beats * beat * 0.9,
            0.045,
            (idea.voice as SynthVoice) || "warm pad",
            decodeVoicing(name,savedPitches),
          );
          start += beats;
        },
      );
      finishAt(start * beat * 1000);
      return;
    }
    if (idea.type === "melody") {
      const melody = idea.data?.length ? idea.data : idea.detail.split(" · ");
      let endBeat = 0;
      melody.forEach((value, index) => {
        const [name, savedStart, savedDuration, savedPitch] = value.split("|");
        const start = Number(savedStart) || index * 0.5;
        const duration = Number(savedDuration) || 0.45;
        const pitch = Number(savedPitch) || 60 + (notePitchClass(name) ?? 0);
        endBeat = Math.max(endBeat, start + duration);
        engine.tone(pitch, start * beat, duration * beat, 0.055, (idea.voice as SynthVoice)||"air flute");
      });
      finishAt(endBeat * beat * 1000);
      return;
    }
    if (idea.type === "drums") {
      playDrumLoop(engine, decodeDrumIdea(idea), 0, 1, drumPatternBeats(idea.data ?? [],beatsPerBar), beat, (idea.voice as DrumKit) || "current");
      finishAt(drumPatternBeats(idea.data ?? [],beatsPerBar) * beat * 1000);
      return;
    }
    if (idea.type === "riff") {
      const riff = decodeRiffIdea(idea);
      playRiff(engine, riff, 0, beat, (idea.voice as SynthVoice)||"analog pulse");
      finishAt(
        Math.max(...riff.map((note) => note.start + note.duration)) *
          beat *
          1000,
      );
      return;
    }
    if (idea.type === "bass") {
      const bass = decodeBassIdea(idea);
      bass.forEach((event) =>
        engine.tone(event.pitch, event.start * beat, event.duration * beat, event.accent ? .065 : .05, "deep bass"),
      );
      finishAt(Math.max(.5, ...bass.map((event) => event.start + event.duration)) * beat * 1000);
      return;
    }
    if (idea.type === "audio" && idea.recordingId) {
      const blob = await getRecording(idea.recordingId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ideaAudio.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          ideaAudio.current = null;
          setPlayingIdeaId(null);
        };
        try {
          await audio.play();
        } catch {
          URL.revokeObjectURL(url);
          ideaAudio.current = null;
          setPlayingIdeaId(null);
        }
        return;
      }
    }
    setPlayingIdeaId(null);
  };
  const openIdea = (sectionId: string, idea: Idea) => {
    if (idea.type === "text") {
      setIdeaSection(sectionId);
      setEditingNoteId(idea.id);
      setNote(idea.detail);
    } else if (
      idea.type === "chords" ||
      idea.type === "melody" ||
      idea.type === "drums" ||
      idea.type === "bass" ||
      idea.type === "riff" ||
      idea.type === "transition"
    )
      editIdea(sectionId, idea);
    else void playIdea(idea);
  };
  const addSectionNote = (sectionId: string) => {
    setEditingNoteId(null);
    setNote("");
    setIdeaSection(sectionId);
  };
  const arrangementPlan = buildSongPlan(project);
  const arrangementCheck=analyzeArrangement(project);
  const markerIndex = Math.max(0, arrangementPlan.markers.findLastIndex((marker) => marker.seconds <= playbackSeconds));
  const marker = arrangementPlan.markers[markerIndex];
  const beatInBar = marker ? Math.max(1, Math.floor((playbackSeconds-marker.seconds)/(60/marker.bpm))+1) : 1;
  const playhead = arrangementPlan.seconds ? Math.min(100,(playbackSeconds/arrangementPlan.seconds)*100) : 0;
  return (
    <>
      <Topbar
        title={project.name}
        subtitle={`${project.key} · ${project.bpm} BPM · ${project.meter}`}
        onBack={back}
      />
      <div className="project-summary">
        <div>
          <span>Song progress</span>
          <div className="song-summary-actions">
            <PlayButton playing={arrangementPlaying} label="song" onClick={() => void playArrangement()} />
            <b>{project.sections.reduce((n, s) => n + s.bars*(s.repeats??1), 0)} bars</b>
          </div>
        </div>
        <div className="arrangement-line">
          <span className="arrangement-playhead" style={{ left:`${playhead}%` }} aria-hidden="true" />
          {project.sections.map((section, index) => (
            <i
              className={`${section.color} ${activeSectionIndex === index ? "playing" : ""}`}
              style={{ flex: section.bars*(section.repeats??1) }}
              key={section.id}
            />
          ))}
        </div>
        <div className="arrangement-transport" aria-label="Arrangement playback controls">
          <span className="transport-position">Bar {markerIndex+1} · Beat {beatInBar}</span>
          <label><input type="checkbox" checked={countIn} onChange={(event)=>setCountIn(event.target.checked)} /> Count-in</label>
          <label><input type="checkbox" checked={arrangementClick} onChange={(event)=>setArrangementClick(event.target.checked)} /> Click</label>
          <button aria-pressed={loopArrangement} className={loopArrangement ? "active" : ""} onClick={()=>setLoopArrangement((value)=>!value)}>↻ Loop</button>
          <button onClick={autoBalanceAll}>Auto balance all</button>
        </div>
        <p className="flow-hint">
          Hear the full sketch, then change one layer inside the section that
          needs it.
        </p>
        {audioStatus && (
          <p className="audio-status" role="status">
            <span aria-hidden="true" />
            {audioStatus}
          </p>
        )}
      </div>
      <section className={`arrangement-check ${arrangementCheck.ready?"is-ready":""}`} aria-labelledby="arrangement-check-title">
        <header><div><p className="eyebrow">Song structure</p><h2 id="arrangement-check-title">Arrangement check</h2></div><span>{arrangementCheck.ready?"Basics covered":"Next moves"}</span></header>
        {arrangementCheck.ready ? <p>This arrangement includes repetition, energy contrast and core rhythmic-harmonic layers.</p> : <div className="arrangement-insights">{arrangementCheck.insights.map(insight=><article key={insight.id}><div><b>{insight.title}</b><p>{insight.detail}</p></div><button onClick={()=>applyArrangementInsight(insight)}>{insight.action==="create_return"?"Create return":insight.action==="shape_energy"?"Shape energy":insight.action==="add_foundation"?`Add ${insight.tool}`:"Add section"}</button></article>)}</div>}
      </section>
      {undoRemoval&&<div className="undo-removal" role="status"><span>Removed {undoRemoval.label}</span><button onClick={restoreRemoval}>Undo</button><button aria-label="Dismiss undo" onClick={()=>setUndoRemoval(null)}>×</button></div>}
      <SectionTitle
        eyebrow=""
        title="Arrangement"
        action="+ Add section"
        onAction={() => setAdding(true)}
      />
      <div className="arrangement-list arrangement-timeline" aria-label="Song sections, top to bottom">
        {project.sections.map((section, index) => (
          <article key={section.id} className={`section-card asset-section ${activeSectionIndex === index ? "playing" : ""}`}>
            <header className="asset-section-heading">
              <div className="section-title-editor"><span className="section-position">SECTION {String(index+1).padStart(2,"0")}</span>{renamingSectionId===section.id?<form onSubmit={event=>{event.preventDefault();commitRename(section.id);}}><input autoFocus aria-label={`Rename ${section.name}`} value={sectionRename} onChange={event=>setSectionRename(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")setRenamingSectionId(null);}}/><button type="submit">Save</button></form>:<div><h3>{section.name}</h3><button className="rename-section" aria-label={`Rename ${section.name}`} onClick={()=>beginRename(section)}>✎</button></div>}</div>
              <PlayButton compact playing={arrangementPlaying && activeSectionIndex === index} label={section.name} onClick={() => void playSection(section,index)} />
            </header>
            <div className="asset-section-meta">
              <label className="section-length"><span>Length</span>
                <select aria-label={`${section.name} length`} value={section.bars} onChange={e=>{stopArrangement();setSectionBars(section.id,Number(e.target.value));}}>
                  {[...new Set([section.bars,4,8,12,16,24,32])].sort((a,b)=>a-b).map(bars=><option key={bars} value={bars}>{bars} bars</option>)}
                </select>
              </label>
              <label className="section-repeat"><span>Repeat</span><select aria-label={`${section.name} repeats`} value={section.repeats??1} onChange={(event)=>setSectionRepeats(section.id,Number(event.target.value))}>{[1,2,3,4].map(value=><option key={value} value={value}>×{value}</option>)}</select></label>
              <label className="section-energy"><span>Energy</span><select aria-label={`${section.name} energy`} value={section.energy??sectionFeel(project,section).energy} onChange={(event)=>setSectionEnergy(section.id,event.target.value as SectionEnergy)}>{["mellow","balanced","powerful"].map(value=><option key={value}>{value}</option>)}</select></label>
              <details className="section-meter-settings"><summary><span>Meter</span><b>{[...new Set(sectionMeterMap(section,project.meter))].join(" / ")}</b></summary>
                <div className="meter-map">{sectionMeterMap(section,project.meter).map((meter,barIndex)=><button key={barIndex} onClick={()=>cycleSectionMeter(section.id,barIndex)} aria-label={`Bar ${barIndex+1}: ${meter}. Change meter`}>{barIndex+1}: {meter}</button>)}</div>
              </details>
            </div>
            <div className="section-assets">
              {([...SECTION_ASSETS,...(section.ideas.some(i=>i.type==="audio") ? [["audio","Recording","●"] as const] : [])]).map(([type,label,icon])=>{
                const assets=section.ideas.filter(i=>i.type===type),idea=assets[0];
                const playable=!!idea && type!=="transition";
                return <div key={type} className={`asset-tile ${idea ? "is-created" : "is-empty"}`}>
                  <button className="asset-open" aria-label={`${idea ? "Edit" : "Create"} ${label} in ${section.name}`} onClick={()=>idea ? openIdea(section.id,idea) : type!=="audio" && openSectionTool(section.id,type)}>
                    <span aria-hidden="true">{icon}</span><span>{label}<small>{idea ? type==="transition" ? "Arrangement instruction" : "Created" : "Not created"}</small></span>
                  </button>
                  <PlayButton compact className="asset-play" playing={!!idea && playingIdeaId===idea.id} disabled={!playable} label={`${label} in ${section.name}`} hint={type==="transition" ? "Transitions are arrangement instructions, with no standalone audio" : !idea ? "Create this asset first" : undefined} onClick={()=>idea && void playIdea(idea)} />
                  <button className="asset-trash" disabled={!idea} aria-label={`Remove ${label} from ${section.name}`} onClick={()=>idea && removeIdea(section.id,idea.id)}><TrashIcon /></button>
                  {assets.length>1 && <select className="asset-takes" aria-label={`${label} saved version in ${section.name}`} value={idea.id} onChange={e=>{
                    const chosen=assets.find(i=>i.id===e.target.value);if(!chosen)return;
                    stopArrangement();stopIdea();clearAssetDraft(section.id,idea);
                    update(p=>({...p,sections:p.sections.map(s=>s.id===section.id?{...s,ideas:[chosen,...s.ideas.filter(i=>i.id!==chosen.id)]}:s)}));
                  }}>{assets.map((asset,i)=><option key={asset.id} value={asset.id}>{i+1}. {asset.name}</option>)}</select>}
                </div>;
              })}
            </div>
            <details className="section-mixer embedded-mixer">
              <summary>Mix tracks <span>peak-safe</span></summary>
              <button className="auto-balance" onClick={()=>autoBalanceSection(section.id)}>Auto balance this section</button>
              <div className="mixer-grid">
                {LAYER_LABELS.map(([layer, label]) => {
                  const settings = sectionMix(section)[layer];
                  return (
                    <div className="mixer-channel" key={layer}>
                      <b>{label}</b>
                      <button
                        aria-label={`Mute ${label} in ${section.name}`}
                        aria-pressed={settings.muted}
                        onClick={() => updateSectionMix(section.id, layer, { muted: !settings.muted })}
                      >Mute</button>
                      <button
                        aria-label={`Solo ${label} in ${section.name}`}
                        aria-pressed={settings.solo}
                        onClick={() => updateSectionMix(section.id, layer, { solo: !settings.solo })}
                      >Solo</button>
                      <label className="track-volume">
                        <span>{Math.round(settings.volume * 100)}%</span>
                        <input
                          type="range"
                          aria-label={`${label} volume in ${section.name}`}
                          min="0"
                          max="1"
                          step="0.05"
                          value={settings.volume}
                          onChange={(event) => updateSectionMix(section.id, layer, { volume: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </details>
            <section className="section-notes" aria-label={`Notes for ${section.name}`}>
              <header>
                <div><b>Section notes</b><span>{section.ideas.filter(i=>i.type==="text").length ? `${section.ideas.filter(i=>i.type==="text").length} saved` : "Lyrics, production or arrangement"}</span></div>
                <button className="add-section-note" onClick={()=>addSectionNote(section.id)}>＋ Add note</button>
              </header>
              {section.ideas.filter(i=>i.type==="text").map(idea=><div className="existing-note" key={idea.id}><button aria-label={`Edit note in ${section.name}`} onClick={()=>openIdea(section.id,idea)}>{idea.detail}</button><button aria-label={`Remove ${idea.name}`} onClick={()=>removeIdea(section.id,idea.id)}><TrashIcon /></button></div>)}
            </section>
            <footer className="section-order-controls">
              <button onClick={()=>move(index,-1)} disabled={index===0} aria-label={`Move ${section.name} up`}>↑</button>
              <button onClick={()=>move(index,1)} disabled={index===project.sections.length-1} aria-label={`Move ${section.name} down`}>↓</button>
              <button onClick={()=>duplicateSection(section.id,false)} aria-label={`Duplicate ${section.name}`}>⧉ <span>Copy</span></button>
              <button onClick={()=>duplicateSection(section.id,true)} aria-label={`Create variation of ${section.name}`}>⌁ <span>Variation</span></button>
              <button onClick={()=>removeSection(section.id)} disabled={project.sections.length===1} aria-label={`Remove ${section.name}`}><TrashIcon /></button>
            </footer>
          </article>
        ))}
      </div>
      <div className="project-actions">
        <button className="capture-action icon-action" aria-label="Record idea" title="Record idea" onClick={record}>●</button>
        <button onClick={() => setAdding(true)}>＋ Add section</button>
        <button className="danger-action icon-action" aria-label="Delete project" title="Delete project" onClick={deleteProject}><TrashIcon /></button>
      </div>
      {adding && (
        <div className="modal-layer">
          <div className="modal small">
            <button className="modal-close" onClick={() => setAdding(false)}>
              ×
            </button>
            <p className="eyebrow">New section</p>
            <h2>Where does the song go next?</h2>
            <label className="field">
              <span>Section name</span>
              <input
                value={sectionName}
                onChange={(event) => setSectionName(event.target.value)}
                placeholder="Bridge, pre-chorus, outro…"
              />
            </label>
            <button
              className="primary-button wide"
              disabled={!sectionName.trim()}
              onClick={() => {
                update((p) => ({
                  ...p,
                  sections: [
                    ...p.sections,
                    {
                      id: uid(),
                      name: sectionName.trim(),
                      bars: 8,
                      color: COLORS[p.sections.length % COLORS.length],
                      ideas: [],
                    },
                  ],
                }));
                setSectionName("");
                setAdding(false);
              }}
            >
              Add section
            </button>
          </div>
        </div>
      )}
      {ideaSection && (
        <div className="modal-layer">
          <div className="modal small">
            <button
              className="modal-close"
              onClick={() => setIdeaSection(null)}
            >
              ×
            </button>
            <p className="eyebrow">Section note</p>
            <h2>{editingNoteId ? "Edit note" : "Catch the thought"}</h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lyric, production note, or arrangement thought…"
            />
            <button
              className="primary-button wide"
              onClick={() => {
                if (!note.trim()) return;
                update((p) => ({
                  ...p,
                  sections: p.sections.map((s) =>
                    s.id === ideaSection
                      ? {
                          ...s,
                          ideas: editingNoteId
                            ? s.ideas.map((idea) =>
                                idea.id === editingNoteId
                                  ? { ...idea, detail: note }
                                  : idea,
                              )
                            : [
                                ...s.ideas,
                                {
                                  id: uid(),
                                  type: "text",
                                  name: "Note",
                                  detail: note,
                                },
                              ],
                        }
                      : s,
                  ),
                }));
                setNote("");
                setEditingNoteId(null);
                setIdeaSection(null);
              }}
            >
              {editingNoteId ? "Update note" : "Save note"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SharedSectionPlayer({ project, previews, activeSectionId, chooseSection, updateProject }: {
  project: Project;
  previews: Record<string, DraftPreview>;
  activeSectionId: string | null;
  chooseSection: (id: string) => void;
  updateProject: (fn: (project: Project) => Project) => void;
}) {
  const engine = useAudioEngine();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const selectedSection = project.sections.find(s => s.id === activeSectionId) ?? project.sections[0];
  const mix = sectionMix(selectedSection);
  const previewProject = useMemo(() => ({ ...project, sections: selectedSection ? [{
    ...selectedSection,
    ideas: (["drums", "bass", "chords", "melody", "riff"] as const).reduce((ideas, type) => {
      const draft = previews[`${project.id}/${activeSectionId ?? "scratch"}/${type}`];
      if (!draft) return ideas;
      const next = [...ideas], index = next.findIndex(idea => idea.type === type);
      const idea: Idea = { id:`preview-${type}`, type: type as SongLayer, name:`${type} draft`, detail:"", data:draft.data, voice:draft.voice };
      if (index >= 0) next[index] = idea; else next.push(idea);
      return next;
    }, [...selectedSection.ideas]),
  }] : [] }), [project, selectedSection, previews, activeSectionId]);
  const plan = useMemo(() => buildSongPlan(previewProject), [previewProject]);
  const latest = useRef({ plan, mix });
  useEffect(() => { latest.current = { plan, mix }; }, [plan, mix]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null), generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current=null; engine.stopAll(); setPlaying(false); setProgress(0);
  }, [engine]);
  useEffect(() => {
    window.addEventListener("inspitivity-solo-preview",stop);
    return () => { window.removeEventListener("inspitivity-solo-preview",stop); stop(); };
  }, [stop, project.id, selectedSection?.id]);
  const start = async () => {
    stop();
    const token = generation.current;
    try {
      if (!(await engine.unlock()) || token !== generation.current) return;
      if (!latest.current.plan.events.length) { setMessage("Add or generate a part to hear this section."); return; }
      window.dispatchEvent(new Event("inspitivity-context-play"));
      setMessage(""); setPlaying(true);
      let cyclePlan=latest.current.plan, origin=engine.get().currentTime+.04, index=0;
      const schedule = () => {
        const now=engine.get().currentTime;
        if (now > origin+cyclePlan.seconds) {
          origin += Math.max(1,Math.floor((now-origin)/Math.max(.1,cyclePlan.seconds)))*cyclePlan.seconds;
          cyclePlan=latest.current.plan; index=0;
        }
        let guard=0;
        while (guard++ < 5000) {
          if (index >= cyclePlan.events.length) {
            if (origin+cyclePlan.seconds > now+.12 || cyclePlan.seconds <= 0) break;
            origin+=cyclePlan.seconds; cyclePlan=latest.current.plan; index=0;
            if (!cyclePlan.events.length) break;
          }
          const event=cyclePlan.events[index];
          if (!event || origin+event.seconds > now+.12) break;
          index++;
          if (origin+event.seconds < now-.02) continue;
          const settings=latest.current.mix[event.layer], solo=Object.values(latest.current.mix).some(m=>m.solo);
          if (settings.muted || (solo && !settings.solo) || settings.volume <= 0) continue;
          const delay=Math.max(0,origin+event.seconds-engine.get().currentTime);
          if (event.layer === "drums") {
            const instrument=(Object.entries(DRUM_PITCHES).find(([,pitch])=>pitch===event.pitch)?.[0] as DrumInstrument | undefined);
            if (instrument) engine.drum(instrument,delay,event.velocity*settings.volume*.9, (event.voice ?? "current") as DrumKit);
          } else {
            const voice=(event.voice ?? (event.layer === "chords" ? "warm pad" : event.layer === "melody" ? "air flute" : event.layer === "bass" ? "deep bass" : "analog pulse")) as SynthVoice;
            const baseGain = event.layer === "chords" ? .052 : event.layer === "melody" ? .058 : event.layer === "bass" ? .065 : .055;
            engine.tone(event.pitch,delay,event.secondsDuration,baseGain*event.velocity*settings.volume,voice === "current" ? "deep bass" : voice);
          }
        }
        setProgress(Math.max(0,Math.min(1,(now-origin)/Math.max(.1,cyclePlan.seconds))));
      };
      schedule(); timer.current=setInterval(schedule,25);
    } catch { setMessage("Audio could not start. Tap Play again."); stop(); }
  };
  const updateMix = (layer: SongLayer, settings: Partial<TrackMix>) => {
    stop();
    updateProject(current => ({
      ...current,
      sections: current.sections.map(section => section.id === selectedSection?.id ? {
        ...section,
        mix: { ...section.mix, [layer]: { ...sectionMix(section)[layer], ...settings } },
      } : section),
    }));
  };
  return <section className="section-player" aria-label="Current section player">
    <div className="section-player-heading"><div><p className="eyebrow">CURRENT SECTION</p><b>{selectedSection?.name}</b></div>
      <label>Section<select aria-label="Current section" value={selectedSection?.id ?? ""} onChange={e => { stop(); chooseSection(e.target.value); }}>
        {project.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <PlayButton playing={playing} label="section preview" onClick={() => playing ? stop() : void start()} />
    </div>
    <progress aria-label="Playback position" max={1} value={progress} />
    <details className="section-mixer"><summary>Mix tracks</summary><div className="mixer-grid">
      {LAYER_LABELS.map(([layer,label])=><div className="mixer-channel" key={layer}><b>{label}</b>
        <button aria-label={`Mute ${label}`} aria-pressed={mix[layer].muted} onClick={()=>updateMix(layer,{muted:!mix[layer].muted})}>Mute</button>
        <button aria-label={`Solo ${label}`} aria-pressed={mix[layer].solo} onClick={()=>updateMix(layer,{solo:!mix[layer].solo})}>Solo</button>
        <label className="track-volume"><span>{Math.round(mix[layer].volume*100)}%</span><input type="range" aria-label={`${label} volume`} min="0" max="1" step="0.05" value={mix[layer].volume} onChange={e=>updateMix(layer,{volume:Number(e.target.value)})} /></label>
      </div>)}
    </div></details>
    {message && <p role="status">{message}</p>}
  </section>;
}

function PlayButton({ playing, onClick, label, compact = false, className = "", disabled = false, hint }: {
  playing: boolean;
  onClick: () => void;
  label: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return <button type="button"
    className={`play-control ${playing ? "playing" : ""} ${compact ? "compact" : ""} ${className}`}
    onClick={onClick} disabled={disabled} aria-label={`${playing ? "Stop" : "Play"} ${label}`}
    aria-pressed={playing} title={hint ?? `${playing ? "Stop" : "Play"} ${label}`}>
    <span className="play-symbol" aria-hidden="true">{playing ? "■" : "▶"}</span>
    {!compact && <span>{playing ? "Stop" : "Play"}</span>}
  </button>;
}

function ToolHeader({
  title,
  subtitle,
  projectName,
  back,
  go,
  active,
}: {
  title: string;
  subtitle: string;
  projectName?: string;
  back: () => void;
  go: (s: Screen) => void;
  active: Screen;
}) {
  const destinations: [Screen, string, string][] = [
    ["drums", "▦", "Drums"], ["chords", "♯", "Chords"], ["bass", "♭", "Bass"],
    ["melody", "♥", "Melody"], ["riff", "⇶", "Pattern"], ["transition", "⇄", "Transitions"],
    ["metronome", "♩", "Metronome"],
  ];
  return (
    <>
      <Topbar title={title} subtitle={projectName ? `${projectName} · ${subtitle}` : subtitle} onBack={back} />
      <nav className="tool-tabs" aria-label="Project tools">
        {destinations.map(([target, icon, label]) => <button
          key={target}
          className={active === target ? "active" : ""}
          aria-current={active === target ? "page" : undefined}
          onClick={() => go(target)}
        ><span className="tool-tab-icon" aria-hidden="true">{icon}</span>{label}</button>)}
      </nav>
    </>
  );
}

function TempoInput({ bpm, commit, label }: {
  bpm: number;
  commit: (value: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = () => {
    const value = Number(draft);
    if (draft !== null && draft.trim() && Number.isFinite(value))
      commit(clampBpm(value));
    setDraft(null);
  };
  return (
    <input
      aria-label={label}
      type="text"
      inputMode="numeric"
      value={draft ?? String(bpm)}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(null);
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const value = draft?.trim() ? Number(draft) : bpm;
          commit(clampBpm((Number.isFinite(value) ? value : bpm) + (event.key === "ArrowUp" ? 1 : -1)));
          setDraft(null);
        }
      }}
    />
  );
}

function ProjectContext({
  project,
  update,
  onHarmonyChange,
  metronomeEnabled,
  toggleMetronome,
}: {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  onHarmonyChange?: (root: Root, mode: Mode) => void;
  metronomeEnabled?: boolean;
  toggleMetronome?: () => void;
}) {
  const { root, mode } = projectHarmony(project);
  const changeHarmony = (nextRoot: Root, nextMode: Mode) => {
    update((p) => ({ ...p, key: formatProjectKey(nextRoot, nextMode) }));
    onHarmonyChange?.(nextRoot, nextMode);
  };
  return (
    <section className="project-context" aria-label="Project music settings">
      <div className="project-context-title">
        <span>Project settings</span>
        <b>{project.name}</b>
      </div>
      <label className="key-highlight">
        <span>Key</span>
        <select
          aria-label="Project root key"
          value={root}
          onChange={(event) => changeHarmony(event.target.value as Root, mode)}
        >
          {ROOTS.map((note) => (
            <option key={note}>{note}</option>
          ))}
        </select>
        <select
          aria-label="Project mode"
          value={mode}
          onChange={(event) => changeHarmony(root, event.target.value as Mode)}
        >
          {MODES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <div className="global-tempo">
        <span>Tempo</span>
        <TempoInput label="Project tempo" bpm={project.bpm}
          commit={(bpm) => update((p) => ({ ...p, bpm }))} />
        <b>BPM</b>
      </div>
      {toggleMetronome && (
        <button
          className={`context-metronome ${metronomeEnabled ? "active" : ""}`}
          onClick={toggleMetronome}
          aria-label={
            metronomeEnabled
              ? "Disable click during listening"
              : "Enable click during listening"
          }
          aria-pressed={metronomeEnabled}
          title="Adds a click when you listen"
        >
          ♩ Click{metronomeEnabled ? " on" : ""}
        </button>
      )}
    </section>
  );
}

function GeneratorSettings({ children, className="" }: { children: React.ReactNode; className?: string }) {
  const [open,setOpen]=useState(true);
  useEffect(()=>{const media=window.matchMedia("(max-width:700px)"); const update=()=>setOpen(!media.matches); update(); media.addEventListener("change",update); return ()=>media.removeEventListener("change",update);},[]);
  return <details className={`control-panel ${className}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>Generation settings <span>{open ? "−" : "+"}</span></summary><div className="generator-settings-body">{children}</div></details>;
}

function SaveActions({ section, editing, submit }: {
  section?: SongSection;
  editing: boolean;
  submit: (chooseDestination: boolean) => void;
}) {
  return (
    <div className="save-actions">
      <button className="secondary-button wide" onClick={() => submit(false)}>
        {section ? `${editing ? "✓ Save changes in" : "＋ Save to"} ${section.name}` : "＋ Choose where to save…"}
      </button>
      {section && <button className="export-button wide" onClick={() => submit(true)}>Save a copy somewhere else…</button>}
    </div>
  );
}

function ChordTool({
  idea,
  project,
  section,
  sectionIndex,
  updateProject,
  back,
  save,
  go,
  metronomeEnabled,
  toggleMetronome,
}: {
  idea?: Idea;
  project: Project;
  section?: SongSection;
  sectionIndex: number;
  updateProject: (fn: (p: Project) => Project) => void;
  back: () => void;
  save: SaveIdea;
  go: (s: Screen) => void;
  metronomeEnabled: boolean;
  toggleMetronome: () => void;
}) {
  const { root, mode } = projectHarmony(project);
  const initialCount = idea?.data?.length || 4;
  const [initialSeed] = useState(() => freshSeed() + Math.max(0, sectionIndex));
  const supportPitchClasses = useMemo(() => sectionPitchContext(section,"chords"),[section]);
  const [count, setCount] = useDraftState("count", initialCount);
  const [defaultBeats, setDefaultBeats] = useDraftState("defaultBeats", 4);
  const [lengthVariation, setLengthVariation] = useDraftState("lengthVariation", 0);
  const [complexity, setComplexity] = useDraftState<Complexity>("complexity", "medium");
  const [harmonyColour, setHarmonyColour] = useDraftState<HarmonyColour>("harmonyColour", "diatonic");
  const [opening, setOpening] = useDraftState<ProgressionOpening>("opening", "away");
  const [tension, setTension] = useDraftState<HarmonicTension>("harmonicTension", "balanced");
  const [voice, setVoice] = useDraftState<SynthVoice>("voice", (idea?.voice as SynthVoice) || "distorted guitar");
  const [voicing, setVoicing] = useDraftState<VoicingStyle>("voicing", "mixed");
  const [seed, setSeed] = useDraftState("seed", initialSeed);
  const [chords, setChords] = useDraftState<ChordDraft[]>("chords", () =>
    idea
      ? decodeChordDrafts(idea)
      : makeChordDrafts(root, mode, initialCount, "medium", initialSeed,4,0,"diatonic","away","mixed","balanced",supportPitchClasses),
  );
  const [previousChords, setPreviousChords] = useDraftState<ChordDraft[] | null>("previousChords", null);
  const engine = useAudioEngine();
  const regenerate = (nextRoot = root, nextMode = mode) => {
    setPreviousChords(chords);
    const nextSeed = seed + 1;
    setSeed(nextSeed);
    setChords(
      makeChordDrafts(
        nextRoot,
        nextMode,
        count,
        complexity,
        nextSeed,
        defaultBeats,
        lengthVariation,
        harmonyColour,
        opening,
        voicing,
        tension,
        supportPitchClasses,
      ),
    );
  };
  const totalBeats = chords.reduce((sum, chord) => sum + chord.beats, 0);
  const beatSeconds = beatDurationSeconds(project.bpm);
  const play = useCallback(() => {
    let startBeat = 0;
    chords.forEach((chord) => {
      playChord(
        engine,
        chord.name,
        startBeat * beatSeconds,
        chord.beats * beatSeconds * 0.92,
        0.045,
        voice,
        chord.pitches,
      );
      startBeat += chord.beats;
    });
    if (metronomeEnabled)
      scheduleClickTrack(engine, startBeat, beatSeconds, project.meter);
  }, [chords, beatSeconds, engine, metronomeEnabled, project.meter, voice]);
  const transport = useLoopTransport(
    play,
    progressionLoopDurationMs(totalBeats, project.bpm),
    engine.stopAll,
    engine.unlock,
  );
  const updateChord = (id: string, changes: Partial<ChordDraft>) =>
    setChords((items) =>
      items.map((chord) =>
        chord.id === id ? { ...chord, ...changes, ...(changes.name ? {pitches:voiceChord(changes.name,seed,voicing)} : {}) } : chord,
      ),
    );
  const updateVoicingPitch = (chordId: string, pitchIndex: number, pitch: number) =>
    setChords((items) => items.map((chord) => {
      if (chord.id !== chordId) return chord;
      const pitches = [...(chord.pitches ?? decodeVoicing(chord.name))];
      pitches[pitchIndex] = pitch;
      return { ...chord, pitches };
    }));
  const removeVoicingPitch = (chordId: string, pitchIndex: number) =>
    setChords((items) => items.map((chord) => {
      if (chord.id !== chordId) return chord;
      const pitches = chord.pitches ?? decodeVoicing(chord.name);
      return pitches.length > 1 ? { ...chord, pitches:pitches.filter((_, index) => index !== pitchIndex) } : chord;
    }));
  const addVoicingPitch = (chordId: string) =>
    setChords((items) => items.map((chord) => {
      if (chord.id !== chordId) return chord;
      const pitches = [...(chord.pitches ?? decodeVoicing(chord.name))];
      return { ...chord, pitches:[...pitches, Math.min(96, (pitches.at(-1) ?? 60) + 3)] };
    }));
  useDraftPreview({ type: "chords", data: chords.map(encodeChord), voice });
  return (
    <>
      <ToolHeader
        title="Chord Progression"
        subtitle="Shape coherent harmonic arcs, then make them yours"
        projectName={project.name}
        back={back}
        go={go}
        active="chords"
      />
      <ProjectContext
        project={project}
        update={updateProject}
        onHarmonyChange={(nextRoot, nextMode) => regenerate(nextRoot, nextMode)}
        metronomeEnabled={metronomeEnabled}
        toggleMetronome={toggleMetronome}
      />
      {section && (
        <p className="destination-name">
          Editing {section.name} · {section.bars} bars{supportPitchClasses.length ? " · supporting its melody, bass and pattern" : ""}
        </p>
      )}
      <DraftToolbar />
      <div className="tool-layout">
        <GeneratorSettings className="">
          <div className="idea-starts" aria-label="Harmony starting points">
            <p>Start with a feel</p>
            {([
              ["Dreamy", "advanced", 8, "warm pad"],
              ["Pop pulse", "simple", 2, "pluck"],
              ["Slow bloom", "medium", 4, "glass"],
            ] as const).map(([label, level, beats, sound]) => (
              <button key={label} onClick={() => {
                transport.stop();
                setPreviousChords(chords);
                setComplexity(level); setDefaultBeats(beats); setVoice(sound);
                setHarmonyColour("diatonic"); setLengthVariation(0);
                setSeed(seed + 1);
                setChords(makeChordDrafts(root, mode, count, level, seed + 1, beats, 0, "diatonic", opening, voicing, tension, supportPitchClasses));
              }}>{label}</button>
            ))}
          </div>
          {previousChords && <button className="export-button wide" onClick={() => {
            transport.stop(); setChords(previousChords); setPreviousChords(chords);
          }}>↶ Swap with previous progression</button>}
          <ControlTitle n="1" title="Number of chords" />
          <label className="range-control">
            <span>{count} chords</span>
            <input
              aria-label="Number of chords"
              type="range"
              min="2"
              max="12"
              step="1"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </label>
          <ControlTitle n="2" title="Default chord length" />
          <label className="range-control">
            <span>
              {defaultBeats} beats {defaultBeats === 4 ? "· whole note" : ""}
            </span>
            <input
              aria-label="Default chord length"
              type="range"
              min="1"
              max="8"
              step="1"
              value={defaultBeats}
              onChange={(event) => setDefaultBeats(Number(event.target.value))}
            />
          </label>
          <details className="advanced-controls"><summary>Advanced harmony & timing</summary>
          <ControlTitle n="3" title="Length variation" />
          <label className="range-control">
            <span>
              {lengthVariation === 0
                ? "Uniform"
                : `${lengthVariation}% variation`}
            </span>
            <input
              aria-label="Chord length variation"
              type="range"
              min="0"
              max="100"
              step="5"
              value={lengthVariation}
              onChange={(event) =>
                setLengthVariation(Number(event.target.value))
              }
            />
          </label>
          <ControlTitle n="4" title="Where should it begin?" />
          <Segment
            options={["away", "tonic", "surprise"]}
            value={opening}
            set={(value) => setOpening(value as ProgressionOpening)}
          />
          <ControlTitle n="5" title="Complexity" />
          <Segment
            options={["simple", "medium", "advanced"]}
            value={complexity}
            set={(v) => setComplexity(v as Complexity)}
          />
          <ControlTitle n="6" title="Harmony colour" />
          <Select
            label="Colour device"
            value={harmonyColour}
            set={(value) => setHarmonyColour(value as HarmonyColour)}
            options={[
              "diatonic",
              "modal interchange",
              "chromatic mediant",
              "quartal",
              "pedal point",
            ]}
          />
          <ControlTitle n="7" title="Harmonic tension" />
          <Segment options={["smooth","balanced","bold"]} value={tension} set={(value)=>setTension(value as HarmonicTension)} />
          </details>
          <Select label="Chord voicing" value={voicing} options={["mixed", "close", "open", "drop 2"]} set={value => {
            transport.stop(); setVoicing(value as VoicingStyle); setSeed(seed+1);
            setChords(chords.map((c,i)=>({...c,pitches:voiceChord(c.name,seed+1+i*997,value as VoicingStyle)})));
          }} />
          <button className="secondary-button wide" onClick={()=>{transport.stop();setSeed(seed+1);setChords(chords.map((c,i)=>({...c,pitches:voiceChord(c.name,seed+1+i*997,voicing)})));}}>↻ Revoice these chords</button>
          <ControlTitle n="8" title="Preview sound" />
          <Select
            label="Instrument"
            value={voice}
            set={(value) => setVoice(value as SynthVoice)}
            options={SYNTH_VOICES}
          />
          <p className="control-note">
            Each generation explores a new harmonic path. Revoice keeps your chords and changes their inversions, spacing and register.
          </p>
          <button className="primary-button wide" onClick={() => regenerate()}>
            Generate progression <span>↻</span>
          </button>
        </GeneratorSettings>
        <section className="result-panel">
          <VariationControls value={chords} apply={value=>{transport.stop();setChords(value);}} vary={(kind,locks)=>{
            setSeed(seed+1);
            const candidate=makeChordDrafts(root,mode,chords.length,complexity,seed+97,defaultBeats,lengthVariation,harmonyColour,opening,voicing,tension,supportPitchClasses);
            const changeCount=kind==="subtle"?1:Math.max(2,Math.ceil(chords.length/3));
            return chords.map((chord,index)=>({...chord,
              name:!locks.notes && index>=chords.length-changeCount && candidate[index].name!==chord.name ? candidate[index].name : chord.name,
              pitches:!locks.notes && index>=chords.length-changeCount ? candidate[index].pitches : chord.pitches,
              beats:locks.rhythm ? chord.beats : kind==="space" ? Math.min(8,chord.beats*2) : kind==="energy" ? Math.max(1,chord.beats/2) : chord.beats
            }));
          }} />
          <div className="result-heading">
            <div>
              <p className="eyebrow">
                {idea ? "Editing saved progression" : "Your progression"}
              </p>
              <h2>{formatProjectKey(root, mode)}</h2>
            </div>
            <PlayButton playing={transport.mode !== "stopped"} label="progression"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
          </div>
          <div className="chord-editor">
            {chords.map((chord, index) => (
              <article key={chord.id}>
                <span className="chord-number">{index + 1}</span>
                <label>
                  <span>Chord</span>
                  <input
                    aria-label={`Chord ${index + 1}`}
                    value={chord.name}
                    onChange={(event) =>
                      updateChord(chord.id, { name: event.target.value })
                    }
                  />
                  <small
                    className="chord-role"
                    aria-label={`Harmonic role: ${chordRole(chord.name, root, mode)}`}
                  >
                    {chordRole(chord.name, root, mode)}
                  </small>
                </label>
                <label>
                  <span>Length</span>
                  <select
                    aria-label={`Chord ${index + 1} length`}
                    value={chord.beats}
                    onChange={(event) =>
                      updateChord(chord.id, {
                        beats: Number(event.target.value),
                      })
                    }
                  >
                    <option value="1">1 beat</option>
                    <option value="2">2 beats</option>
                    <option value="4">4 beats · whole</option>
                    <option value="8">8 beats</option>
                  </select>
                </label>
                <button
                  className="remove-chord"
                  aria-label={`Remove chord ${index + 1}`}
                  disabled={chords.length === 1}
                  onClick={() =>
                    setChords((items) =>
                      items.filter((item) => item.id !== chord.id),
                    )
                  }
                >
                  ×
                </button>
                <div className="voicing-editor" aria-label={`Chord ${index+1} voicing`}>
                  <span className="voicing-label">Voicing notes</span>
                  <div className="voicing-note-list">
                    {(chord.pitches ?? decodeVoicing(chord.name)).map((pitch,pitchIndex)=><div className="voicing-note" key={`${pitch}-${pitchIndex}`}>
                      <select aria-label={`Chord ${index+1} voicing note ${pitchIndex+1}`} value={pitch} onChange={event=>updateVoicingPitch(chord.id,pitchIndex,Number(event.target.value))}>
                        {VOICING_PITCHES.map(option=><option key={option} value={option}>{midiNoteName(option)}</option>)}
                      </select>
                      <button aria-label={`Remove ${midiNoteName(pitch)} from chord ${index+1}`} disabled={(chord.pitches ?? decodeVoicing(chord.name)).length===1} onClick={()=>removeVoicingPitch(chord.id,pitchIndex)}>×</button>
                    </div>)}
                    <button className="add-voicing-note" onClick={()=>addVoicingPitch(chord.id)}>＋ Tone</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <button
            className="add-chord"
            onClick={() =>
              setChords((items) => [
                ...items,
                {
                  id: uid(),
                  name: `${root}${["minor", "dorian", "phrygian", "harmonic minor", "minor pentatonic"].includes(mode) ? "m" : ""}`,
                  beats: defaultBeats,
                },
              ])
            }
          >
            ＋ Add chord
          </button>
          <div
            className={`playback-bar ${transport.mode !== "stopped" ? "is-playing" : ""}`}
          >
            <PlayButton playing={transport.mode !== "stopped"} label="progression"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
            <Wave bars={22} />
            <span>
              {project.bpm} BPM · {totalBeats} beats
            </span>
            <button
              className={`loop-button ${transport.mode === "loop" ? "active" : ""}`}
              onClick={() =>
                transport.mode === "loop"
                  ? transport.stop()
                  : transport.start(true)
              }
              aria-label={
                transport.mode === "loop"
                  ? "Stop looping progression"
                  : "Loop progression"
              }
              aria-pressed={transport.mode === "loop"}
            >
              ↻<small>{transport.mode === "loop" ? "Looping" : "Loop"}</small>
            </button>
          </div>
          <SaveActions section={section} editing={!!idea}
            submit={(chooseDestination) =>
              save(
                "chords",
                `${formatProjectKey(root, mode)} progression`,
                chords.map((c) => `${c.name} (${c.beats} beats)`).join(" · "),
                chords.map(encodeChord),
                chooseDestination,
                voice,
              )
            }
          />
          <button
            className="export-button wide"
            onClick={() => {
              let cursor = 0;
              const notes: MidiNoteEvent[] = [];
              chords.forEach((chord) => {
                const pitch = notePitchClass(chord.name);
                if (pitch !== null)
                  (chord.pitches ?? decodeVoicing(chord.name)).forEach((pitch) =>
                    notes.push({ pitch, start: cursor, duration: chord.beats * 0.92, velocity: 0.68 }),
                  );
                cursor += chord.beats;
              });
              downloadMidi(`${project.name}-chords`, createMidiFile({ name: `${project.name} chords`, bpm: project.bpm, meter: project.meter, notes, program: MIDI_PROGRAMS[voice] }));
            }}
          >
            ⇩ Export chords as MIDI
          </button>
        </section>
      </div>
    </>
  );
}

function MelodyTool({
  idea,
  project,
  section,
  sectionIndex,
  updateProject,
  back,
  save,
  go,
  metronomeEnabled,
  toggleMetronome,
}: {
  idea?: Idea;
  project: Project;
  section?: SongSection;
  sectionIndex: number;
  updateProject: (fn: (p: Project) => Project) => void;
  back: () => void;
  save: SaveIdea;
  go: (s: Screen) => void;
  metronomeEnabled: boolean;
  toggleMetronome: () => void;
}) {
  const { root, mode } = projectHarmony(project);
  const defaultNoteCount = section
    ? Math.max(
        8,
        Math.floor(
          section.bars * (Number(project.meter.split("/")[0]) || 4) * 1.5,
        ),
      )
    : 16;
  const [initialSeed] = useState(() => freshSeed() + Math.max(0,sectionIndex));
  const [mood, setMood] = useDraftState<MelodyMood>("mood", () =>
    (["calm", "bright", "melancholic", "dark"] as const).find(value => idea?.name.startsWith(value)) ?? "calm",
  );
  const [shape, setShape] = useDraftState<PhraseShape>("shape", () =>
    (["flow", "hook", "answer", "floating"] as const).find(value => idea?.name.split(" ").includes(value)) ?? "flow",
  );
  const [density, setDensity] = useDraftState("density", () => complementaryMelodyDensity(section,project.meter));
  const [noteCount, setNoteCount] = useDraftState("noteCount", Math.min(30, defaultNoteCount));
  const [seed, setSeed] = useDraftState("seed", initialSeed);
  const [voice, setVoice] = useDraftState<SynthVoice>("voice", (idea?.voice as SynthVoice) || "air flute");
  const [savedMelody, setSavedMelody] = useDraftState("savedMelody", () =>
    idea ? decodeMelodyIdea(idea) : null,
  );
  const [previousMelody, setPreviousMelody] = useDraftState<ReturnType<typeof generateMelody> | null>("previousMelody", null);
  const engine = useAudioEngine();
  const supportingChords = useMemo(() => {
    const savedHarmony = (section ?? project.sections[0])?.ideas.find(
      (sectionIdea) => sectionIdea.type === "chords",
    );
    return savedHarmony
      ? decodeChordDrafts(savedHarmony)
      : makeChordDrafts(root, mode, 4, "medium", initialSeed, 4, 0, "diatonic", "away");
  }, [section, project.sections, root, mode, initialSeed]);
  const generatedMelody = useMemo(
    () =>
      fitMelodyToSection(
        generateMelody({ root, mode, notes: noteCount, density, mood, seed, shape }),
        supportingChords,
        section,
      ),
    [root, mode, noteCount, density, mood, seed, shape, supportingChords,section],
  );
  const melody = savedMelody ?? generatedMelody;
  const bpm = project.bpm;
  const beatSeconds = beatDurationSeconds(bpm);
  const play = useCallback(() => {
    melody.forEach((n) =>
      engine.tone(
        n.pitch,
        n.start * beatSeconds,
        n.duration * beatSeconds * 0.9,
        0.055,
        voice,
      ),
    );
    if (metronomeEnabled)
      scheduleClickTrack(
        engine,
        Math.max(
          1,
          Math.ceil(
            Math.max(...melody.map((note) => note.start + note.duration)),
          ),
        ),
        beatSeconds,
        project.meter,
      );
  }, [melody, beatSeconds, engine, metronomeEnabled, project.meter, voice]);
  const transport = useLoopTransport(
    play,
    melodyLoopDurationMs(melody, bpm),
    engine.stopAll,
    engine.unlock,
  );
  const melodyBeats = Math.max(
    4,
    ...melody.map((note) => note.start + note.duration),
  );
  const [draggingNote, setDraggingNote] = useState<{
    index: number;
    action: "pitch" | "duration";
    x: number;
    y: number;
    pitch: number;
    duration: number;
    rollWidth: number;
  } | null>(null);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(() => melody.length ? 0 : null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    setSelectedNoteIndex((current) => current !== null && current < melody.length ? current : melody.length ? 0 : null);
  }, [melody.length]);
  const updateNote = (
    index: number,
    changes: { pitch?: number; duration?: number },
  ) =>
    setSavedMelody((current) => {
      const next = [...(current ?? generatedMelody)];
      const note = next[index];
      const pitch = changes.pitch ?? note.pitch;
      next[index] = { ...note, ...changes, pitch, note: midiNoteName(pitch) };
      return next;
    });
  const beginNoteDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const note = melody[index];
    setSelectedNoteIndex(index);
    const bounds = event.currentTarget.getBoundingClientRect();
    const rollWidth =
      event.currentTarget.parentElement?.getBoundingClientRect().width ?? 1;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSavedMelody((current) => current ?? [...generatedMelody]);
    setDraggingNote({
      index,
      action: event.clientX > bounds.right - 14 ? "duration" : "pitch",
      x: event.clientX,
      y: event.clientY,
      pitch: note.pitch,
      duration: note.duration,
      rollWidth,
    });
  };
  const dragNote = (
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!draggingNote || draggingNote.index !== index) return;
    if (draggingNote.action === "duration")
      updateNote(index, {
        duration: Math.max(
          0.125,
          Math.min(
            8,
            draggingNote.duration +
              ((event.clientX - draggingNote.x) / draggingNote.rollWidth) *
                melodyBeats,
          ),
        ),
      });
    else
      updateNote(index, {
        pitch: Math.max(
          36,
          Math.min(
            96,
            draggingNote.pitch -
              Math.round((event.clientY - draggingNote.y) / 8),
          ),
        ),
      });
  };
  const chooseKeyboardPitch = (pitch: number) => {
    transport.stop();
    if (selectedNoteIndex === null || !melody[selectedNoteIndex]) {
      const start = Math.max(0, ...melody.map((note) => note.start + note.duration));
      const next = [...melody, { note:midiNoteName(pitch), start, duration:.5, pitch, velocity:.72 }];
      setSavedMelody(next);
      setSelectedNoteIndex(next.length - 1);
    } else updateNote(selectedNoteIndex, { pitch });
    void engine.unlock().then((ready) => { if (ready) engine.tone(pitch, 0, .32, .065, voice); });
  };
  const addMelodyNote = () => {
    transport.stop();
    const pitch = selectedNoteIndex !== null ? melody[selectedNoteIndex]?.pitch ?? 60 : 60;
    const start = Math.max(0, ...melody.map((note) => note.start + note.duration));
    const next = [...melody, { note:midiNoteName(pitch), start, duration:.5, pitch, velocity:.72 }];
    setSavedMelody(next);
    setSelectedNoteIndex(next.length - 1);
  };
  const removeSelectedMelodyNote = () => {
    if (selectedNoteIndex === null || !melody[selectedNoteIndex]) return;
    transport.stop();
    const next = melody.filter((_, index) => index !== selectedNoteIndex);
    setSavedMelody(next);
    setSelectedNoteIndex(next.length ? Math.min(selectedNoteIndex, next.length - 1) : null);
  };
  const applyTransform = (transform: MotifTransform) =>
    setSavedMelody((current) =>
      transformMotif(current ?? generatedMelody, transform).map((note) => ({
        ...note,
        note: midiNoteName(note.pitch),
      })),
    );
  const harmonyForTension = section?.ideas.find(
    (item) => item.type === "chords",
  )
    ? decodeChordDrafts(section.ideas.find((item) => item.type === "chords")!)
    : makeChordDrafts(root, mode, 4, "medium", initialSeed);
  const tensionMap = melody.map((note) => {
    let cursor = 0;
    const chord =
      harmonyForTension.find((item) => {
        cursor += item.beats;
        return note.start < cursor;
      })?.name ?? root;
    return { note: note.note, tension: classifyTension(note.pitch, chord) };
  });
  const moods: Array<[MelodyMood, string]> = [
    ["calm", "≈"],
    ["bright", "☼"],
    ["melancholic", "☂"],
    ["dark", "◔"],
  ];
  useDraftPreview({ type: "melody", data: melody.map(n => `${n.note}|${n.start}|${n.duration}|${n.pitch}`), voice });
  return (
    <>
      <ToolHeader
        title="Melody Generator"
        subtitle="Shape motifs with movement and intention"
        projectName={project.name}
        back={back}
        go={go}
        active="melody"
      />
      <ProjectContext
        project={project}
        update={updateProject}
        metronomeEnabled={metronomeEnabled}
        toggleMetronome={toggleMetronome}
      />
      {section && (
        <p className="destination-name">
          Editing {section.name} · {section.bars} bars · following its harmony and leaving room for its bass/pattern
        </p>
      )}
      <DraftToolbar />
      <div className="tool-layout">
        <GeneratorSettings className="violet-panel">
          <div className="idea-starts" aria-label="Melody phrase shapes">
            <p>Shape the phrase</p>
            {([
              ["flow", "Flowing", "Stepwise movement and varied timing."],
              ["hook", "Repeating hook", "A short, recognizable rhythm that returns."],
              ["answer", "Question & answer", "Paired phrases with room to breathe."],
              ["floating", "Floating", "Longer notes and open space."],
            ] as const).map(([value, label, description]) => (
              <button key={value} aria-pressed={shape === value} title={description}
                onClick={() => {
                  transport.stop(); setPreviousMelody(melody);
                  setSavedMelody(null); setShape(value);
                }}>{label}</button>
            ))}
          </div>
          {previousMelody && <button className="export-button wide" onClick={() => {
            transport.stop(); setSavedMelody(previousMelody); setPreviousMelody(melody);
          }}>↶ Swap with previous melody</button>}
          <ControlTitle n="1" title="Mood" />
          <div className="mood-grid">
            {moods.map(([name, icon]) => (
              <button
                key={name}
                className={mood === name ? "active" : ""}
                onClick={() => {
                  setSavedMelody(null);
                  setMood(name);
                }}
              >
                <b>{icon}</b>
                <span>{name}</span>
              </button>
            ))}
          </div>
          <ControlTitle n="2" title="Rhythmic density" />
          <input
            className="density-range"
            aria-label="Rhythmic density"
            type="range"
            min=".2"
            max="1"
            step=".1"
            value={density}
            onChange={(e) => {
              setSavedMelody(null);
              setDensity(Number(e.target.value));
            }}
          />
          <ControlTitle n="3" title="Number of notes" />
          <label className="range-control">
            <span>{noteCount} notes</span>
            <input
              aria-label="Number of melody notes"
              type="range"
              min="0"
              max="30"
              step="1"
              value={noteCount}
              onChange={(event) => {
                setSavedMelody(null);
                setNoteCount(Number(event.target.value));
              }}
            />
          </label>
          <details className="advanced-controls"><summary>Advanced motif transformations</summary>
          <ControlTitle n="4" title="Motif development" />
          <div className="motif-actions" aria-label="Transform this motif">
            {(
              [
                "invert",
                "retrograde",
                "augment",
                "diminish",
                "transpose",
              ] as MotifTransform[]
            ).map((transform) => (
              <button key={transform} onClick={() => applyTransform(transform)}>
                {transform}
              </button>
            ))}
          </div>
          </details>
          <ControlTitle n="5" title="Preview sound" />
          <Select
            label="Instrument"
            value={voice}
            set={(value) => setVoice(value as SynthVoice)}
            options={SYNTH_VOICES}
          />
          <p className="control-note">
            Keep the key and mood, then explore another phrase. Hooks repeat a
            rhythm; floating lines leave more space. Recover your last idea above.
          </p>
          <button
            className="primary-button violet-button wide"
            onClick={() => {
              transport.stop();
              setPreviousMelody(melody);
              setSavedMelody(null);
              setSeed((s) => s + 1);
            }}
          >
            Generate melody <span>↻</span>
          </button>
        </GeneratorSettings>
        <section className="result-panel">
          <VariationControls value={melody} apply={value=>{transport.stop();setSavedMelody(value);}} vary={(kind,locks)=>{
            setSeed(seed+1);
            return varyNotes(melody,kind,locks,getScale(root,mode).map(n=>notePitchClass(n) ?? 0),seed+1).map(n=>({...n,note:midiNoteName(n.pitch)}));
          }} />
          <div className="result-heading">
            <div>
              <p className="eyebrow violet-text">
                {idea ? "Editing saved melody" : "Your melody"}
              </p>
              <h2>
                {mood} motif · {formatProjectKey(root, mode)}
              </h2>
            </div>
            <PlayButton playing={transport.mode !== "stopped"} label="melody"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
          </div>
          <div className="piano-roll">
            <p className="roll-hint">
              Drag notes up/down for pitch. Drag the right edge to change
              duration.
            </p>
            {melody.map((note, i) => (
              <button
                key={i}
                className={`piano-note ${draggingNote?.index === i ? "dragging" : ""} ${selectedNoteIndex === i ? "selected" : ""}`}
                aria-pressed={selectedNoteIndex === i}
                title={`${note.note} · ${note.duration.toFixed(2)} beats`}
                onPointerDown={(event) => beginNoteDrag(event, i)}
                onPointerMove={(event) => dragNote(event, i)}
                onPointerUp={() => setDraggingNote(null)}
                onPointerCancel={() => setDraggingNote(null)}
                style={{
                  left: `${2 + (note.start / melodyBeats) * 94}%`,
                  bottom: `${Math.max(8, Math.min(82, 10 + ((note.pitch - 48) / 36) * 72))}%`,
                  width: `${Math.max(3, (note.duration / melodyBeats) * 94)}%`,
                }}
              >
                <span>{note.note}</span>
                <b>{note.duration.toFixed(note.duration < 1 ? 2 : 1)}b</b>
                <i aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={`note-keyboard-dock ${keyboardOpen ? "is-open" : ""}`}>
            <button className="keyboard-toggle" aria-expanded={keyboardOpen} onClick={()=>setKeyboardOpen((open)=>!open)}>
              <span>⌨ Piano keyboard</span>
              <small>{selectedNoteIndex === null ? "Add a note" : `Note ${selectedNoteIndex+1} · ${melody[selectedNoteIndex]?.note ?? "Select"}`}</small>
              <b aria-hidden="true">{keyboardOpen ? "↓" : "↑"}</b>
            </button>
            {keyboardOpen && <div className="keyboard-panel">
              <div className="keyboard-actions">
                <p>{selectedNoteIndex === null ? "Choose a key to add a note." : `Choose a pitch for note ${selectedNoteIndex+1}. Keys audition immediately.`}</p>
                <div><button onClick={addMelodyNote}>＋ Add note</button><button onClick={removeSelectedMelodyNote} disabled={selectedNoteIndex===null}>Remove selected</button></div>
              </div>
              <OnScreenKeyboard selectedPitch={selectedNoteIndex === null ? undefined : melody[selectedNoteIndex]?.pitch} onPitch={chooseKeyboardPitch} />
            </div>}
          </div>
          <div
            className="tension-map"
            aria-label="Harmony and melody tension guide"
          >
            <b>Tension map</b>
            {tensionMap.map((item, index) => (
              <span
                key={`${item.note}-${index}`}
                className={item.tension.replace(" ", "-")}
              >
                {item.note} · {item.tension}
              </span>
            ))}
          </div>
          <div
            className={`playback-bar violet-wave ${transport.mode !== "stopped" ? "is-playing" : ""}`}
          >
            <PlayButton playing={transport.mode !== "stopped"} label="melody"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
            <Wave tone="violet" bars={22} />
            <span>{bpm} BPM</span>
            <button
              className={`loop-button ${transport.mode === "loop" ? "active" : ""}`}
              onClick={() =>
                transport.mode === "loop"
                  ? transport.stop()
                  : transport.start(true)
              }
              aria-label={
                transport.mode === "loop"
                  ? "Stop looping melody"
                  : "Loop melody"
              }
              aria-pressed={transport.mode === "loop"}
            >
              ↻<small>{transport.mode === "loop" ? "Looping" : "Loop"}</small>
            </button>
          </div>
          <SaveActions section={section} editing={!!idea}
            submit={(chooseDestination) =>
              save(
                "melody",
                `${mood} ${shape} ${root} ${mode} melody`,
                melody.map((n) => n.note).join(" · "),
                melody.map(
                  (n) => `${n.note}|${n.start}|${n.duration}|${n.pitch}`,
                ),
                chooseDestination,
                voice,
              )
            }
          />
          <button
            className="export-button wide"
            onClick={() =>
              downloadMidi(
                `${project.name}-melody`,
                createMidiFile({ name: `${project.name} melody`, bpm, meter: project.meter, notes: melody, program: MIDI_PROGRAMS[voice] }),
              )
            }
          >
            ⇩ Export melody as MIDI
          </button>
        </section>
      </div>
    </>
  );
}

function BassTool({
  idea,
  project,
  section,
  sectionIndex,
  updateProject,
  back,
  save,
  go,
  metronomeEnabled,
  toggleMetronome,
}: {
  idea?: Idea;
  project: Project;
  section?: SongSection;
  sectionIndex: number;
  updateProject: (fn: (p: Project) => Project) => void;
  back: () => void;
  save: SaveIdea;
  go: (s: Screen) => void;
  metronomeEnabled: boolean;
  toggleMetronome: () => void;
}) {
  const [pattern, setPattern] = useDraftState<BassPattern>("bassPattern", "groove");
  const [lockToKick, setLockToKick] = useDraftState("bassLockToKick", true);
  const [seed, setSeed] = useDraftState("bassSeed", () => freshSeed() + Math.max(0, sectionIndex));
  const [savedBass, setSavedBass] = useDraftState<BassEvent[] | null>("savedBass", () => idea ? decodeBassIdea(idea) : null);
  const generated = useMemo(
    () => generateBassLine(project, section, pattern, lockToKick, seed),
    [project, section, pattern, lockToKick, seed],
  );
  const bass = savedBass ?? generated;
  const beatSeconds = beatDurationSeconds(project.bpm);
  const length = Math.max(.5, ...bass.map((event) => event.start + event.duration));
  const engine = useAudioEngine();
  const play = useCallback(() => {
    bass.forEach((event) => engine.tone(event.pitch, event.start * beatSeconds, event.duration * beatSeconds, event.accent ? .065 : .05, "deep bass"));
    if (metronomeEnabled) scheduleClickTrack(engine, Math.ceil(length), beatSeconds, project.meter);
  }, [bass, beatSeconds, engine, length, metronomeEnabled, project.meter]);
  const transport = useLoopTransport(play, length * beatSeconds * 1000, engine.stopAll, engine.unlock);
  useDraftPreview({ type:"bass", data:bass.map(encodeBassEvent), voice:"deep bass" });
  const regenerate = () => { transport.stop(); setSavedBass(null); setSeed((value) => value + 1); };
  return <>
    <ToolHeader title="Bass Generator" subtitle="Connect harmony and drums with a focused mono bass line" projectName={project.name} back={back} go={go} active="bass" />
    <ProjectContext project={project} update={updateProject} metronomeEnabled={metronomeEnabled} toggleMetronome={toggleMetronome} />
    {section && <p className="destination-name">Following {section.name} · {section.energy ?? sectionFeel(project,section).energy} energy</p>}
    <DraftToolbar />
    <div className="tool-layout">
      <GeneratorSettings className="bass-panel">
        <ControlTitle n="1" title="Bass movement" />
        <Select label="Pattern" value={pattern} options={["sustained","eighth notes","groove","syncopated","progressive"]} set={(value) => { transport.stop(); setSavedBass(null); setPattern(value as BassPattern); }} />
        <ControlTitle n="2" title="Rhythm-section lock" />
        <label className="bass-lock"><input type="checkbox" checked={lockToKick} onChange={(event) => { transport.stop(); setSavedBass(null); setLockToKick(event.target.checked); }} /><span>Follow kick attacks when drums exist</span></label>
        <p className="control-note">Chord changes are always preserved. Kick lock changes note timing, not harmony.</p>
        <button className="primary-button wide" onClick={regenerate}>Generate new bass line <span>↻</span></button>
      </GeneratorSettings>
      <section className="result-panel bass-result">
        <div className="result-heading"><div><p className="eyebrow">Mono electric bass</p><h2>{pattern} · {bass.length} notes</h2></div><PlayButton playing={transport.mode !== "stopped"} label="bass line" onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} /></div>
        <div className="bass-roll" aria-label="Bass timing preview">
          {bass.map((event,index)=><span key={`${event.start}-${index}`} className={event.accent ? "accent" : ""} style={{left:`${(event.start/length)*100}%`,width:`${Math.max(2,(event.duration/length)*100)}%`,bottom:`${18+(event.pitch-36)*7}px`}} title={`${midiNoteName(event.pitch)} · beat ${event.start+1}`}>{midiNoteName(event.pitch)}</span>)}
        </div>
        <div className={`playback-bar ${transport.mode !== "stopped" ? "is-playing" : ""}`}><button aria-label="Play bass line" onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()}>{transport.mode === "stopped" ? "▶" : "■"}</button><Wave tone="blue" bars={12}/><button className={`loop-button ${transport.mode === "loop" ? "active" : ""}`} aria-pressed={transport.mode === "loop"} onClick={() => transport.mode === "loop" ? transport.stop() : void transport.start(true)}>↻ <small>Loop</small></button></div>
        <SaveActions section={section} editing={!!idea} submit={(chooseDestination) => save("bass", `${pattern} bass`, `${bass.length} notes · ${lockToKick ? "kick locked" : "independent pulse"}`, bass.map(encodeBassEvent), chooseDestination, "deep bass")} />
        <button className="export-button wide" onClick={() => downloadMidi(`${project.name}-bass`, createMidiFile({name:`${project.name} bass`,bpm:project.bpm,meter:project.meter,notes:bass,program:MIDI_PROGRAMS["deep bass"]}))}>⇩ Export bass as MIDI</button>
      </section>
    </div>
  </>;
}

function RiffTool({
  idea,
  project,
  section,
  sectionIndex,
  updateProject,
  back,
  save,
  go,
  metronomeEnabled,
  toggleMetronome,
}: {
  idea?: Idea;
  project: Project;
  section?: SongSection;
  sectionIndex: number;
  updateProject: (fn: (p: Project) => Project) => void;
  back: () => void;
  save: SaveIdea;
  go: (s: Screen) => void;
  metronomeEnabled: boolean;
  toggleMetronome: () => void;
}) {
  const { root, mode } = projectHarmony(project);
  const beats = section
    ? sectionBeatTotal(section, project.meter)
    : meterBeats(project.meter);
  const [cycle, setCycle] = useDraftState("cycle", 5);
  const [grouping, setGrouping] = useDraftState("grouping", "3+3+2");
  const [density, setDensity] = useDraftState("density", 0.72);
  const [startOffset, setStartOffset] = useDraftState("startOffset", 0.5);
  const [motion, setMotion] = useDraftState<PatternMotion>("motion", "orbit");
  const [voice, setVoice] = useDraftState<SynthVoice>("voice", (idea?.voice as SynthVoice)||"analog pulse");
  const [seed, setSeed] = useDraftState("seed", () => freshSeed() + Math.max(0,sectionIndex));
  const [savedRiff, setSavedRiff] = useDraftState<RiffEvent[] | null>("savedRiff", () =>
    idea ? decodeRiffIdea(idea) : null,
  );
  const engine = useAudioEngine();
  const riffHarmony = (section ?? project.sections[0])?.ideas.find(i => i.type === "chords");
  const harmonyData = JSON.stringify(riffHarmony?.data ?? []);
  const generatedRiff = useMemo(() => {
    const generated = generateProgRiff({ root, mode, beats, cycle, grouping, density, seed, startOffset, motion });
    const harmony = (JSON.parse(harmonyData) as string[]).map((value,index)=>{const [name,length]=value.split("|"); return {id:String(index),name,beats:Number(length)||4};});
    return fitMelodyToChords(generated.map(n=>({...n,note:midiNoteName(n.pitch),velocity:.7})),harmony);
  }, [root, mode, beats, cycle, grouping, density, seed, startOffset, motion, harmonyData]);
  const riff = savedRiff ?? generatedRiff;
  const beatSeconds = beatDurationSeconds(project.bpm);
  const play = useCallback(() => {
    playRiff(engine, riff, 0, beatSeconds, voice);
    if (metronomeEnabled)
      scheduleClickTrack(engine, beats, beatSeconds, project.meter);
  }, [engine, riff, beatSeconds, metronomeEnabled, beats, project.meter, voice]);
  const transport = useLoopTransport(
    play,
    progressionLoopDurationMs(beats, project.bpm),
    engine.stopAll,
    engine.unlock,
  );
  useDraftPreview({ type: "riff", data: riff.map(n => `${n.pitch}|${n.start}|${n.duration}|${n.accent ? 1 : 0}|${n.muted ? 1 : 0}`), voice });
  return (
    <>
      <ToolHeader
        title="Synth Pattern"
        subtitle="Create a repeating pulse that pulls the track forward"
        projectName={project.name}
        back={back}
        go={go}
        active="riff"
      />
      <ProjectContext
        project={project}
        update={updateProject}
        metronomeEnabled={metronomeEnabled}
        toggleMetronome={toggleMetronome}
      />
      {section && (
        <p className="destination-name">
          Editing {section.name} ·{" "}
          {sectionMeterMap(section, project.meter).join(" → ")}
        </p>
      )}
      <DraftToolbar />
      <div className="tool-layout">
        <GeneratorSettings className="riff-panel">
          <details className="advanced-controls"><summary>Advanced pulse & grouping</summary>
          <ControlTitle n="1" title="Pattern length" />
          <Segment
            options={[3, 4, 5, 7]}
            value={cycle}
            set={(value) => {
              setSavedRiff(null);
              setCycle(Number(value));
            }}
            suffix=" pulses"
          />
          <ControlTitle n="2" title="Rhythm shape" />
          <Select
            label="Grouping"
            value={grouping}
            set={(value) => {
              setSavedRiff(null);
              setGrouping(value);
            }}
            options={["3+3+2", "2+2+3", "4+3", "3+2+2", "5+5+3"]}
          />
          </details>
          <ControlTitle n="3" title="Start position" />
          <Select
            label="First note"
            value={PATTERN_STARTS.find((option) => option[1] === startOffset)?.[0] ?? "An 8th late"}
            set={(value) => {
              setSavedRiff(null);
              setStartOffset(PATTERN_STARTS.find((option) => option[0] === value)?.[1] ?? 0.5);
            }}
            options={PATTERN_STARTS.map((option) => option[0])}
          />
          <ControlTitle n="4" title="Pitch motion" />
          <Segment
            options={["anchor", "rise", "fall", "orbit"]}
            value={motion}
            set={(value) => {
              setSavedRiff(null);
              setMotion(value as PatternMotion);
            }}
          />
          <ControlTitle n="5" title="Activity" />
          <input
            className="density-range"
            aria-label="Synth pattern activity"
            type="range"
            min=".3"
            max="1"
            step=".1"
            value={density}
            onChange={(event) => {
              setSavedRiff(null);
              setDensity(Number(event.target.value));
            }}
          />
          <ControlTitle n="6" title="Sound" />
          <Select label="Instrument" value={voice} set={(value) => setVoice(value as SynthVoice)} options={SYNTH_VOICES} />
          <p className="control-note">
            The first note is deliberately displaced. A short pitch cell then
            repeats across the section with one restrained turnaround change.
          </p>
          <button
            className="primary-button wide"
            onClick={() => {
              setSavedRiff(null);
              setSeed((value) => value + 1);
            }}
          >
            Create another pattern <span>↻</span>
          </button>
        </GeneratorSettings>
        <section className="result-panel">
          <VariationControls value={riff} apply={value=>{transport.stop();setSavedRiff(value);}} vary={(kind,locks)=>{
            setSeed(seed+1);
            return varyNotes(riff,kind,locks,getScale(root,mode).map(n=>notePitchClass(n) ?? 0),seed+1);
          }} />
          <div className="result-heading">
            <div>
              <p className="eyebrow">REPEATING GUIDE PATTERN</p>
              <h2>
                {cycle} pulse · {grouping}
              </h2>
            </div>
            <PlayButton playing={transport.mode !== "stopped"} label="pattern"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
          </div>
          <div className="riff-grid" aria-label="Generated synth pattern events">
            {riff.map((note, index) => (
              <span
                key={index}
                className={note.accent ? "accent" : ""}
                style={{
                  left: `${(note.start / beats) * 94}%`,
                  width: `${Math.max(2, (note.duration / beats) * 94)}%`,
                }}
                title={`${midiNoteName(note.pitch)} · ${note.muted ? "muted" : "open"}`}
              >
                {midiNoteName(note.pitch)}
              </span>
            ))}
          </div>
          <div
            className={`playback-bar ${transport.mode !== "stopped" ? "is-playing" : ""}`}
          >
            <PlayButton playing={transport.mode !== "stopped"} label="pattern"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
            <Wave bars={22} />
            <span>
              {project.bpm} BPM · {beats} beats
            </span>
            <button
              className={`loop-button ${transport.mode === "loop" ? "active" : ""}`}
              onClick={() =>
                transport.mode === "loop"
                  ? transport.stop()
                  : transport.start(true)
              }
              aria-label={
                transport.mode === "loop" ? "Stop looping synth pattern" : "Loop synth pattern"
              }
              aria-pressed={transport.mode === "loop"}
            >
              ↻<small>{transport.mode === "loop" ? "Looping" : "Loop"}</small>
            </button>
          </div>
          <button
            className="secondary-button wide"
            onClick={() =>
              save(
                "riff",
                `${cycle}-pulse ${grouping} synth pattern`,
                `${riff.length} notes · starts after ${startOffset} beat · ${grouping} across ${section?.meterMap?.join(" → ") ?? project.meter}`,
                riff.map(
                  (note) =>
                    `${note.pitch}|${note.start}|${note.duration}|${note.accent ? 1 : 0}|${note.muted ? 1 : 0}`,
                ),
                false,
                voice,
              )
            }
          >
            {idea ? "✓ Update pattern" : `＋ Save to ${project.name}`}
          </button>
          <button
            className="export-button wide"
            onClick={() =>
              downloadMidi(
                `${project.name}-synth-pattern`,
                createMidiFile({ name: `${project.name} synth pattern`, bpm: project.bpm, meter: project.meter, notes: riff, program: MIDI_PROGRAMS[voice] }),
              )
            }
          >
            ⇩ Export pattern as MIDI
          </button>
        </section>
      </div>
    </>
  );
}

function TransitionTool({
  idea,
  project,
  section,
  updateProject,
  back,
  save,
  go,
}: {
  idea?: Idea;
  project: Project;
  section?: SongSection;
  updateProject: (fn: (p: Project) => Project) => void;
  back: () => void;
  save: SaveIdea;
  go: (s: Screen) => void;
}) {
  const [style, setStyle] = useState<TransitionStyle>(
    (idea?.data?.[0] as TransitionStyle) ?? "metric modulation",
  );
  const fromMeter = section
    ? (sectionMeterMap(section, project.meter).at(-1) ?? project.meter)
    : project.meter;
  const [toMeter, setToMeter] = useState(
    idea?.data?.[1] ?? nextProgMeter(fromMeter),
  );
  const apply = () => {
    if (section && style === "metric modulation")
      updateProject((current) => ({
        ...current,
        sections: current.sections.map((item) =>
          item.id === section.id
            ? {
                ...item,
                meterMap: [
                  ...sectionMeterMap(item, current.meter).slice(0, -1),
                  toMeter,
                ],
              }
            : item,
        ),
      }));
    save(
      "transition",
      `${style} into ${toMeter}`,
      transitionDescription(style, fromMeter, toMeter),
      [style, toMeter],
    );
  };
  return (
    <>
      <ToolHeader
        title="Transition Builder"
        subtitle="Connect sections with intent, not just a cut"
        projectName={project.name}
        back={back}
        go={go}
        active="transition"
      />
      <ProjectContext project={project} update={updateProject} />
      {section && (
        <p className="destination-name">
          From {section.name} · final bar {fromMeter}
        </p>
      )}
      <div className="tool-layout">
        <GeneratorSettings className="transition-panel">
          <ControlTitle n="1" title="Transition device" />
          <Select
            label="Device"
            value={style}
            set={(value) => setStyle(value as TransitionStyle)}
            options={[
              "metric modulation",
              "tempo ramp",
              "drum fill",
              "pivot chord",
              "pedal point",
              "riff mutation",
            ]}
          />
          <ControlTitle n="2" title="Arrival meter" />
          <Select
            label="Target meter"
            value={toMeter}
            set={setToMeter}
            options={PROG_METERS}
          />
          <p className="control-note">
            Metric modulation writes the target meter into the last bar of this
            section. Other devices become a saved arrangement instruction you
            can reopen and refine.
          </p>
          <button className="primary-button wide" onClick={apply}>
            {idea ? "✓ Update transition" : "＋ Add transition"}
          </button>
        </GeneratorSettings>
        <section className="result-panel transition-preview">
          <p className="eyebrow">YOUR TRANSITION</p>
          <h2>{style}</h2>
          <div className="transition-route">
            <b>{fromMeter}</b>
            <span>→</span>
            <b>{toMeter}</b>
          </div>
          <p>{transitionDescription(style, fromMeter, toMeter)}</p>
          <small>Saved with this section and visible in the arrangement.</small>
        </section>
      </div>
    </>
  );
}

function DrumTool({
  idea,
  project,
  section,
  sectionIndex,
  updateProject,
  back,
  save,
  go,
  metronomeEnabled,
  toggleMetronome,
}: {
  idea?: Idea;
  project: Project;
  section?: SongSection;
  sectionIndex: number;
  updateProject: (fn: (p: Project) => Project) => void;
  back: () => void;
  save: SaveIdea;
  go: (s: Screen) => void;
  metronomeEnabled: boolean;
  toggleMetronome: () => void;
}) {
  const drumMeter = section
    ? sectionMeterMap(section, project.meter)[0]
    : project.meter;
  const beatsPerBar = meterBeats(drumMeter);
  const grooveContext = useMemo(
    () => inferGrooveContext(project, section),
    [project, section],
  );
  const [energyMode, setEnergyMode] = useDraftState<"follow song" | GrooveEnergy>("energyMode",
    "balanced",
  );
  const energy =
    energyMode === "follow song" ? grooveContext.energy : energyMode;
  const [style, setStyle] = useDraftState<DrumStyle>("style", () =>
    grooveContext.energy === "powerful" ? "driving" : "steady",
  );
  const [density, setDensity] = useDraftState("density", () =>
    grooveContext.energy === "mellow"
      ? 0.45
      : grooveContext.energy === "powerful"
        ? 0.78
        : 0.6,
  );
  const [bars, setBars] = useDraftState("phraseBars", idea ? Math.max(1,Math.round(drumPatternBeats(idea.data ?? [],beatsPerBar)/beatsPerBar)) : 4);
  const [fill, setFill] = useDraftState("fill", .7);
  const [visibleBar, setVisibleBar] = useState(0);
  const [editVelocity, setEditVelocity] = useState(.75);
  const phraseBeats = bars*beatsPerBar;
  const supportingAnchors = useMemo(() => sectionRhythmicAnchors(section,"drums"),[section]);
  const activeBar = Math.min(visibleBar,bars-1);
  const [seed, setSeed] = useDraftState("seed", () => freshSeed() + Math.max(0, sectionIndex));
  const [voice, setVoice] = useDraftState<DrumKit>("kit", (idea?.voice as DrumKit) || "current");
  const [savedLoop, setSavedLoop] = useDraftState<DrumHit[] | null>("savedLoop", () =>
    idea ? decodeDrumIdea(idea) : null,
  );
  const engine = useAudioEngine();
  const generatedLoop = useMemo(
    () => reinforceDrumAccents(generateDrumLoop({ beatsPerBar, density, style, energy, seed, bars, fill }),supportingAnchors,phraseBeats*4),
    [beatsPerBar, density, style, energy, seed, bars, fill,supportingAnchors,phraseBeats],
  );
  const loop = savedLoop ?? generatedLoop;
  const beatSeconds = beatDurationSeconds(project.bpm);
  const play = useCallback(() => {
    playDrumLoop(engine, loop, 0, 1, phraseBeats, beatSeconds, voice);
    if (metronomeEnabled)
      scheduleClickTrack(engine, phraseBeats, beatSeconds, drumMeter);
  }, [engine, loop, phraseBeats, beatSeconds, voice, metronomeEnabled, drumMeter]);
  const transport = useLoopTransport(
    play,
    progressionLoopDurationMs(phraseBeats, project.bpm),
    engine.stopAll,
    engine.unlock,
  );
  const toggleHit = (instrument: DrumInstrument, step: number) => {
      const next = [...loop];
      const index = next.findIndex(
        (hit) => hit.instrument === instrument && hit.step === step,
      );
      if (index >= 0 && Math.abs(next[index].velocity-editVelocity)>.01) next[index]={...next[index],velocity:editVelocity};
      else if(index>=0) next.splice(index,1);
      else {
        next.push({ instrument, step, velocity: editVelocity });
        // Audition outside React's state updater so Strict Mode cannot play twice.
        void engine.unlock().then((ready) => {
          if (ready) engine.drum(instrument, 0, editVelocity, voice);
        });
      }
      setSavedLoop(next.sort(
        (a, b) =>
          a.step - b.step ||
          DRUM_INSTRUMENTS.indexOf(a.instrument) -
            DRUM_INSTRUMENTS.indexOf(b.instrument),
      ));
  };
  const regenerate = () => {
    setSavedLoop(null);
    setSeed((current) => current + 1);
  };
  const steps = Array.from({ length: beatsPerBar * 4 }, (_, index) => activeBar*beatsPerBar*4+index);
  useDraftPreview({ type: "drums", data: loop.map(n => `${n.instrument}|${n.step}|${n.velocity}|${phraseBeats}`), voice });
  return (
    <>
      <ToolHeader
        title="Drum Loop Generator"
        subtitle="Build a pocket for your section"
        projectName={project.name}
        back={back}
        go={go}
        active="drums"
      />
      <ProjectContext
        project={project}
        update={updateProject}
        metronomeEnabled={metronomeEnabled}
        toggleMetronome={toggleMetronome}
      />
      {section && (
        <p className="destination-name">
          Editing {section.name} · repeats for {section.bars} bars
        </p>
      )}
      <DraftToolbar />
      <div className="tool-layout">
        <GeneratorSettings className="drum-panel">
          <Select label="Phrase length" value={String(bars)} options={["1","2","4","8"]} set={value=>{transport.stop();setBars(Number(value));setVisibleBar(0);setSavedLoop(null);}} />
          <Select label="Drum kit" value={voice} set={value => setVoice(value as DrumKit)} options={["current", "rock", "prog metal"]} />
          <p className="drum-audition-hint">{voice === "prog metal" ? "Tight kick, crisp snare and bright cymbals. Try linear or djent grooves for syncopated prog accents." : voice === "rock" ? "Weighty kick, full snare and longer cymbal sustain." : "The original electronic kit."}</p>
          <ControlTitle n="1" title="Groove" />
          <Segment
            options={[
              "steady",
              "syncopated",
              "driving",
              "djent",
              "odd meter",
              "linear",
            ]}
            value={style}
            set={(value) => {
              setSavedLoop(null);
              setStyle(value as DrumStyle);
            }}
          />
          <ControlTitle n="2" title="Energy" />
          <Segment
            options={["follow song", "mellow", "balanced", "powerful"]}
            value={energyMode}
            set={(value) => {
              setSavedLoop(null);
              setEnergyMode(value as "follow song" | GrooveEnergy);
            }}
          />
          <div className="groove-context">
            <b>{energyMode === "follow song" ? "Following this section" : "Selected energy"}: {energy}</b>
            <span>{grooveContext.reason}</span>
          </div>
          <ControlTitle n="3" title="Density" />
          <label className="range-control">
            <span>{Math.round(density * 100)}% activity</span>
            <input
              aria-label="Drum density"
              type="range"
              min=".2"
              max="1"
              step=".1"
              value={density}
              onChange={(event) => {
                setSavedLoop(null);
                setDensity(Number(event.target.value));
              }}
            />
          </label>
          <label className="range-control"><span>Fill chance · {Math.round(fill*100)}%</span><input aria-label="Fill chance" type="range" min="0" max="1" step=".1" value={fill} onChange={e=>{setFill(Number(e.target.value));setSavedLoop(null);}} /></label>
          <button
            className="primary-button coral-button wide"
            onClick={regenerate}
          >
            Generate new phrase <span>↻</span>
          </button>
        </GeneratorSettings>
        <section className="result-panel">
          <VariationControls percussion value={loop} apply={value=>{transport.stop();setSavedLoop(value);}} vary={(kind,locks)=>{
            setSeed(seed+1);
            let next=loop.map(hit=>({...hit,velocity:Math.max(.2,Math.min(1,hit.velocity*(kind==="space"?.82:kind==="energy"?1.15:(hit.step%4===0?1.04:.92))))}));
            if(!locks.rhythm && kind==="space") next=next.filter(hit=>hit.instrument!=="hihat" || hit.step%4===0);
            if(!locks.rhythm && kind==="energy") for(let step=0;step<phraseBeats*4;step+=2) if(!next.some(hit=>hit.instrument==="hihat"&&hit.step===step))next.push({instrument:"hihat",step,velocity:.5});
            return next.sort((a,b)=>a.step-b.step);
          }} />
          <div className="result-heading">
            <div>
              <p className="eyebrow coral-text">
                {idea ? "Editing saved drum loop" : "Your drum loop"}
              </p>
              <h2>
                {energy} {style} pocket · {drumMeter}
              </h2>
            </div>
            <PlayButton playing={transport.mode !== "stopped"} label="drum loop"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
          </div>
          <div className="phrase-bars" aria-label="Phrase bars">{Array.from({length:bars},(_,i)=><button key={i} aria-pressed={activeBar===i} onClick={()=>setVisibleBar(i)}>Bar {i+1}{i===bars-1 && bars>1 ? " · fill" : ""}</button>)}</div>
          <div className="drum-edit-tools"><span>Hit strength</span><Segment options={["ghost", "normal", "accent"]} value={editVelocity<.4?"ghost":editVelocity>.9?"accent":"normal"} set={value=>setEditVelocity(value==="ghost"?.3:value==="accent"?1:.75)} /></div>
          <p className="drum-audition-hint">Tap to add a hit or apply the selected strength. Tap again at the same strength to remove it. Brighter steps play louder.</p>
          <div
            className="drum-sequencer"
            role="grid"
            aria-label="Drum pattern editor"
          >
            <div className="drum-ruler" aria-hidden="true" style={{gridTemplateColumns:`76px repeat(${steps.length}, minmax(24px,1fr))`}}><span>BAR {activeBar+1}</span>{steps.map((step,i)=><span key={step}>{i%4===0 ? i/4+1 : i%4===2 ? "+" : "·"}</span>)}</div>
            {DRUM_INSTRUMENTS.map((instrument) => (
              <div
                className="drum-row"
                role="row"
                key={instrument}
                style={{
                  gridTemplateColumns: `76px repeat(${steps.length}, minmax(24px, 1fr))`,
                }}
              >
                <b>{DRUM_LABELS[instrument]}</b>
                {steps.map((step) => (
                  <button
                    key={step}
                    role="gridcell"
                    aria-selected={loop.some(hit=>hit.instrument===instrument&&hit.step===step)}
                    style={{ opacity:loop.find(hit=>hit.instrument===instrument&&hit.step===step) ? .35+.65*(loop.find(hit=>hit.instrument===instrument&&hit.step===step)?.velocity ?? 0) : 1 }}
                    className={
                      loop.some(
                        (hit) =>
                          hit.instrument === instrument && hit.step === step,
                      )
                        ? "active"
                        : ""
                    }
                    aria-label={`${DRUM_LABELS[instrument]}, bar ${activeBar+1}, step ${step-activeBar*beatsPerBar*4+1}, velocity ${Math.round((loop.find(hit=>hit.instrument===instrument&&hit.step===step)?.velocity ?? 0)*100)}%`}
                    onClick={() => toggleHit(instrument, step)}
                  />
                ))}
              </div>
            ))}
          </div>
          <div
            className={`playback-bar coral-wave ${transport.mode !== "stopped" ? "is-playing" : ""}`}
          >
            <PlayButton playing={transport.mode !== "stopped"} label="drum loop"
              onClick={() => transport.mode === "stopped" ? void transport.start(false) : transport.stop()} />
            <Wave tone="coral" bars={22} />
            <span>{project.bpm} BPM · {bars} {bars === 1 ? "bar" : "bars"}</span>
            <button
              className={`loop-button ${transport.mode === "loop" ? "active" : ""}`}
              onClick={() =>
                transport.mode === "loop"
                  ? transport.stop()
                  : transport.start(true)
              }
              aria-label={
                transport.mode === "loop"
                  ? "Stop looping drum loop"
                  : "Loop drum loop"
              }
              aria-pressed={transport.mode === "loop"}
            >
              ↻<small>{transport.mode === "loop" ? "Looping" : "Loop"}</small>
            </button>
          </div>
          <SaveActions section={section} editing={!!idea}
            submit={(chooseDestination) =>
              save(
                "drums",
                `${energy} ${style} drum loop`,
                `${loop.length} hits · ${drumMeter}`,
                loop.map(
                  (hit) => `${hit.instrument}|${hit.step}|${hit.velocity}|${phraseBeats}`,
                ),
                chooseDestination,
                voice,
              )
            }
          />
          <button
            className="export-button wide"
            onClick={() =>
              downloadMidi(
                `${project.name}-drums`,
                createMidiFile({
                  name: `${project.name} drums`,
                  bpm: project.bpm,
                  meter: drumMeter,
                  notes: loop.map((hit) => ({ pitch: DRUM_MIDI_NOTES[hit.instrument], start: hit.step / 4, duration: 0.12, velocity: hit.velocity, channel: 9 })),
                  program: 0,
                }),
              )
            }
          >
            ⇩ Export drums as MIDI
          </button>
        </section>
      </div>
    </>
  );
}

function Metronome({
  project,
  updateProject,
  back,
  go,
}: {
  project: Project;
  updateProject: (fn: (p: Project) => Project) => void;
  back: () => void;
  go: (s: Screen) => void;
}) {
  const bpm = project.bpm;
  const meter = project.meter;
  const setBpm = (value: number | ((bpm: number) => number)) =>
    updateProject((p) => ({
      ...p,
      bpm: clampBpm(typeof value === "function" ? value(p.bpm) : value),
    }));
  const [subdivision, setSubdivision] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const taps = useRef<number[]>([]);
  const timer = useRef<number | null>(null);
  const engine = useAudioEngine();
  const stop = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
    setBeat(0);
    engine.stopAll();
  }, [engine]);
  useEffect(() => {
    if (!playing) return;
    let next = engine.get().currentTime;
    let currentBeat = 0;
    const beats = Number(meter.split("/")[0]);
    const schedule = () => {
      const ctx = engine.get();
      while (next < ctx.currentTime + 0.12) {
        const accented = isAccentedStep(currentBeat, beats, subdivision);
        engine.tone(
          accented ? 88 : 80,
          Math.max(0, next - ctx.currentTime),
          0.04,
          accented ? 0.11 : 0.055,
        );
        setBeat(Math.floor(currentBeat / subdivision) % beats);
        next += subdivisionDurationSeconds(bpm, subdivision);
        currentBeat++;
      }
      timer.current = window.setTimeout(schedule, 30);
    };
    schedule();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      engine.stopAll();
    };
  }, [playing, bpm, meter, subdivision, engine]);
  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now].slice(
      -5,
    );
    const tempo = calculateTapTempo(taps.current);
    if (tempo) setBpm(tempo);
  };
  const beats = Number(meter.split("/")[0]);
  return (
    <>
      <ToolHeader
        title="Metronome"
        subtitle="A steady pulse that stays out of the way"
        projectName={project.name}
        back={back}
        go={go}
        active="metronome"
      />
      <ProjectContext project={project} update={updateProject} />
      <div className="metronome-card">
        <div className="tempo-dial">
          <button aria-label="Decrease tempo" onClick={() => setBpm((b) => b - 1)}>−</button>
          <div>
            <TempoInput label="Tempo" bpm={bpm} commit={setBpm} />
            <span>PROJECT BPM</span>
          </div>
          <button aria-label="Increase tempo" onClick={() => setBpm((b) => b + 1)}>+</button>
        </div>
        <div className="beat-lights">
          {Array.from({ length: beats }, (_, i) => (
            <i
              key={i}
              className={
                playing && beat === i
                  ? i === 0
                    ? "active accent"
                    : "active"
                  : ""
              }
            />
          ))}
        </div>
        <div className="metronome-controls">
          <Select
            label="Time signature"
            value={meter}
            set={(value) => updateProject((p) => ({ ...p, meter: value }))}
            options={["4/4", "3/4", "6/8", "9/8", "5/4", "7/8"]}
          />
          <Select
            label="Subdivision"
            value={String(subdivision)}
            set={(v) => setSubdivision(Number(v))}
            options={["1", "2", "4"]}
          />
        </div>
        <PlayButton className="metronome-play" playing={playing} label="metronome"
          onClick={async () => {
            if (playing) stop();
            else if (await engine.unlock()) setPlaying(true);
          }} />
        <button className="tap-button" onClick={tap}>
          Tap tempo
        </button>
      </div>
    </>
  );
}

function ControlTitle({ n, title }: { n: string; title: string }) {
  return (
    <h3 className="control-title">
      <span>{n}</span>
      {title}
    </h3>
  );
}
function Select({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="select-control">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function Segment<T extends string | number>({
  options,
  value,
  set,
  suffix = "",
}: {
  options: readonly T[];
  value: T;
  set: (v: T) => void;
  suffix?: string;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          className={value === option ? "active" : ""}
          key={option}
          onClick={() => set(option)}
        >
          {String(option)}
          {suffix}
        </button>
      ))}
    </div>
  );
}

function Settings({
  restore,
  syncStatus,
  projects,
  backUp,
  phoneInstall,
  notify,
  theme,
  setTheme,
}: {
  projects: Project[];
  backUp: () => void | Promise<void>;
  restore: (file: File) => Promise<void>;
  syncStatus: string;
  phoneInstall: ReturnType<typeof usePhoneInstall>;
  notify: (message: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const installOnPhone = async () => {
    const installed = await phoneInstall.install();
    if (installed) notify("Inspitivity added to your phone");
  };

  return (
    <>
      <Topbar title="Settings" subtitle="Your ideas, on every device" />
      <div className="settings-card compact theme-settings">
        <p className="eyebrow">Appearance</p>
        <h2>Theme</h2>
        <p>Choose how Inspitivity looks on this device.</p>
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          <button
            className={`theme-choice crimson-preview ${theme === "crimson" ? "active" : ""}`}
            onClick={() => setTheme("crimson")}
            role="radio"
            aria-checked={theme === "crimson"}
          >
            <span className="theme-swatch"><i /><i /><i /></span>
            <b>Black / Red / White</b>
            <small>Focused · heavier</small>
          </button>
          <button
            className={`theme-choice electric-preview ${theme === "electric" ? "active" : ""}`}
            onClick={() => setTheme("electric")}
            role="radio"
            aria-checked={theme === "electric"}
          >
            <span className="theme-swatch"><i /><i /><i /></span>
            <b>Electric Green</b>
            <small>Creative · exploratory</small>
          </button>
        </div>
      </div>
      <div className="settings-card">
        <span className="settings-icon">◎</span>
        <h2>Your ideas stay yours.</h2>
        <p>
          Projects and recordings sync privately through this site. A device copy keeps your work available offline. Draft experiments stay on the device until you save them to a section.
        </p>
        <div className="storage-row">
          <span>Projects</span>
          <b>{projects.length}</b>
        </div>
        <div className="storage-row">
          <span>Cloud sync</span>
          <b className="mint-text">{syncStatus}</b>
        </div>
        <button className="secondary-button wide" onClick={backUp}>
          ↓ Download complete backup
        </button>
        <label className="backup-import">Restore backup as copies<input type="file" accept=".json,application/json" onChange={event => { const file=event.target.files?.[0]; if (file) void restore(file); event.target.value=""; }} /></label>
        <p>Includes recordings. Older project-only backups can also be imported. Restoring never replaces existing projects.</p>
      </div>
      <div className="settings-card compact install-card">
        <span className="phone-glyph" aria-hidden="true">▯</span>
        <div>
          <p className="eyebrow">Phone app</p>
          <h3>
            {phoneInstall.standalone
              ? "Installed on this device"
              : "Add Inspitivity to your Home Screen"}
          </h3>
          {phoneInstall.standalone ? (
            <p>
              Inspitivity now opens full-screen and keeps your projects on this
              device.
            </p>
          ) : phoneInstall.canInstall ? (
            <p>
              Install the app for a full-screen workspace and faster access.
            </p>
          ) : phoneInstall.isIos ? (
            <ol className="install-steps">
              <li>Open this page in Safari.</li>
              <li>Tap the Share button.</li>
              <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            </ol>
          ) : (
            <p>
              Open your browser menu and choose <b>Install app</b> or
              <b> Add to Home screen</b>.
            </p>
          )}
          {phoneInstall.canInstall && !phoneInstall.standalone && (
            <button
              className="primary-button wide"
              onClick={installOnPhone}
            >
              Install on this device
            </button>
          )}
        </div>
      </div>
      <div className="settings-card compact">
        <h3>Account and storage</h3>
        <p>
          Projects and recordings are stored privately under your signed-in ChatGPT account and synchronized across devices. This device also keeps a local working copy for resilience. Drafts that have not been saved remain on this device.
        </p>
      </div>
    </>
  );
}

function ConfirmProjectDelete({
  project,
  close,
  confirm,
}: {
  project: Project;
  close: () => void;
  confirm: () => void;
}) {
  return (
    <div className="modal-layer" role="presentation">
      <div
        className="modal small confirm-delete"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-copy"
      >
        <button className="modal-close" onClick={close} aria-label="Close">×</button>
        <p className="eyebrow danger-text">Delete project</p>
        <h2 id="delete-project-title">Delete “{project.name}”?</h2>
        <p id="delete-project-copy">
          This removes the project and its arrangement from your devices. This
          cannot be undone after sync.
        </p>
        <div className="confirm-actions">
          <button className="secondary-button" onClick={close}>Cancel</button>
          <button className="danger-button" onClick={confirm}>Delete project</button>
        </div>
      </div>
    </div>
  );
}

function ProjectModal({
  close,
  submit,
}: {
  close: () => void;
  submit: (name: string, bpm: number, key: string) => void;
}) {
  const [name, setName] = useState("");
  const [bpm, setBpm] = useState(120);
  const [root, setRoot] = useState("E");
  const [mode, setMode] = useState("Dorian");
  return (
    <div className="modal-layer">
      <div className="modal">
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">New project</p>
        <h2>What are you making?</h2>
        <label className="field">
          <span>Project title</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled song"
          />
        </label>
        <div className="two-cols">
          <label className="field">
            <span>BPM</span>
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
            />
          </label>
          <Select label="Root" value={root} set={setRoot} options={ROOTS} />
        </div>
        <Select
          label="Mode"
          value={mode}
          set={setMode}
          options={["Major", "Minor", "Dorian", "Mixolydian", "Lydian"]}
        />
        <button
          className="primary-button wide"
          disabled={!name.trim()}
          onClick={() => submit(name.trim(), bpm, `${root} ${mode}`)}
        >
          Create project
        </button>
      </div>
    </div>
  );
}

function CreateModal({
  close,
  choose,
}: {
  close: () => void;
  choose: (
    a: "project" | "record" | "chords" | "bass" | "melody" | "drums" | "riff" | "transition",
  ) => void;
}) {
  return (
    <div className="modal-layer">
      <div className="modal create-modal">
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">Stay in the flow</p>
        <h2>Create something</h2>
        <div className="create-choices">
          <ToolButton
            tone="coral"
            icon="●"
            title="Record idea"
            copy="Use your microphone"
            onClick={() => choose("record")}
          />
          <ToolButton
            tone="coral"
            icon="●"
            title="Drum loop"
            copy="Build a pocket"
            onClick={() => choose("drums")}
          />
         <ToolButton
            tone="blue"
            icon="♯"
            title="New progression"
            copy="Find the harmony"
            onClick={() => choose("chords")}
          />
          <ToolButton
            tone="violet"
            icon="♭"
            title="Bass line"
            copy="Connect harmony and drums"
            onClick={() => choose("bass")}
          />
          <ToolButton
            tone="violet"
            icon="♥"
            title="New melody"
            copy="Shape a motif"
            onClick={() => choose("melody")}
          />
          <ToolButton
            tone="amber"
            icon="⇶"
            title="Synth pattern"
            copy="Build a repeating guide"
            onClick={() => choose("riff")}
          />
          <ToolButton
            tone="amber"
            icon="⇄"
            title="Transition"
            copy="Connect two sections"
            onClick={() => choose("transition")}
          />
           <ToolButton
            tone="amber"
            icon="＋"
            title="New project"
            copy="Start a song"
            onClick={() => choose("project")}
          />
        </div>
      </div>
    </div>
  );
}

function SaveDestinationModal({
  projects,
  defaultProjectId,
  idea,
  close,
  save,
}: {
  projects: Project[];
  defaultProjectId: string;
  idea: IdeaDraft;
  close: () => void;
  save: (projectId: string, sectionId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const initialProject =
    projects.find((project) => project.id === defaultProjectId) ?? projects[0];
  const [projectId, setProjectId] = useState(initialProject?.id ?? "");
  const [sectionId, setSectionId] = useState(
    initialProject?.sections[0]?.id ?? "",
  );
  const destinationProject =
    projects.find((project) => project.id === projectId) ?? projects[0];
  const destinationSection = destinationProject?.sections.find(
    (section) => section.id === sectionId,
  );
  const chooseProject = (nextProjectId: string) => {
    const nextProject = projects.find(
      (project) => project.id === nextProjectId,
    );
    setProjectId(nextProjectId);
    setSectionId(nextProject?.sections[0]?.id ?? "");
  };
  const ideaLabel = idea.type === "drums" ? "rhythm" : idea.type;
  return (
      <dialog ref={dialog}
        className="modal small save-destination-modal"
        aria-modal="true"
        aria-labelledby="save-destination-title"
        onCancel={(event) => { event.preventDefault(); close(); }}
      >
        <button className="modal-close" onClick={close} aria-label="Close">
          ×
        </button>
        <p className="eyebrow">Save {ideaLabel}</p>
        <h2 id="save-destination-title">Where should this idea go?</h2>
        <label className="select-control">
          <span>Project</span>
          <select
            aria-label="Destination project"
            value={projectId}
            onChange={(event) => chooseProject(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="select-control">
          <span>Section</span>
          <select
            aria-label="Destination section"
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
            disabled={!destinationProject?.sections.length}
          >
            {(destinationProject?.sections ?? []).map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
        {destinationSection ? (
          <p className="save-destination-summary">
            {idea.name} will be added to <b>{destinationSection.name}</b> in{" "}
            <b>{destinationProject.name}</b>.
          </p>
        ) : (
          <p className="save-destination-summary">
            This project needs a section before you can save an idea to it.
          </p>
        )}
        <button
          className="primary-button wide"
          disabled={!destinationSection}
          onClick={() => save(projectId, sectionId)}
        >
          Save idea
        </button>
        <button className="export-button wide" onClick={close}>Cancel</button>
      </dialog>
  );
}

function RecorderModal({
  project,
  close,
  attach,
}: {
  project: Project;
  close: () => void;
  attach: (sectionId: string, idea: Idea) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sectionId, setSectionId] = useState(project.sections[0]?.id ?? "");
  const [name, setName] = useState("Voice idea");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const clock = useRef<number | null>(null);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      recorder.current = media;
      chunks.current = [];
      media.ondataavailable = (e) => chunks.current.push(e.data);
      media.start();
      setElapsed(0);
      setRecording(true);
      clock.current = window.setInterval(() => setElapsed((t) => t + 1), 1000);
    } catch {
      alert("Microphone access is needed to record an idea.");
    }
  };
  const stop = () => {
    if (!recorder.current) return;
    recorder.current.onstop = async () => {
      const blob = new Blob(chunks.current, {
        type: recorder.current?.mimeType || "audio/webm",
      });
      const id = uid();
      await saveRecording(id, blob);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      attach(sectionId, {
        id: uid(),
        type: "audio",
        name,
        detail: `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} · recorded locally`,
        recordingId: id,
      });
      close();
    };
    recorder.current.stop();
    if (clock.current) clearInterval(clock.current);
    setRecording(false);
  };
  return (
    <div className="modal-layer">
      <div className="modal recorder-modal">
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <p className="eyebrow coral-text">Quick record</p>
        <h2>{recording ? "Listening…" : "Catch it before it goes."}</h2>
        <div className={`record-visual ${recording ? "active" : ""}`}>
          <Wave tone="coral" bars={18} />
          <b>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </b>
        </div>
        <label className="field">
          <span>Idea name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Select
          label="Save to section"
          value={sectionId}
          set={setSectionId}
          options={project.sections.map((s) => s.id)}
        />
        <p className="destination-name">
          {project.name} ·{" "}
          {project.sections.find((s) => s.id === sectionId)?.name}
        </p>
        <button
          className={`record-button ${recording ? "active" : ""}`}
          onClick={recording ? stop : start}
        >
          {recording ? "■ Stop & save" : "● Start recording"}
        </button>
      </div>
    </div>
  );
}
