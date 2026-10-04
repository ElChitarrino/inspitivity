"use client";

import {
  Children,
  isValidElement,
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
  SELECTABLE_MODES,
  canonicalMode,
  MODE_LABELS,
  MelodyMood,
  PhraseShape,
  Mode,
  notePitchClass,
  ProgressionOpening,
  Root,
  seededRandom,
} from "../packages/music-theory";
import { createMidiFile, type MidiNoteEvent } from "../packages/midi";
import { voiceProgression } from "../packages/music-theory/voicing";
import { playbackBeat, activeChordIndex } from "../packages/sequencing/playhead";
import { useAudioEngine } from "./audio/use-audio-engine";
import type { SynthVoice, BassVoice } from "../packages/sequencing/voice-types";
import { LAYER_LABELS, sectionMix, automaticSectionMix } from "../packages/workspace/section-mix";
import { QuarterClickScheduler } from "../packages/sequencing/live-click";
import { reorderSection, timelineDuration } from "../packages/workspace/arrangement-order";
import { playbackProject } from "../packages/workspace/playback";
import { alignPhrase } from "../packages/workspace/sketch";
import { chooseSketch, scoreSketch } from "../packages/workspace/sketch-quality";
import { generateThemeDraft, THEME_FEELS, type ThemeFeel, type ExplorerOptions } from "../packages/workspace/theme-explorer";
import { useThemeAI } from "./use-theme-ai";
import { adaptAccompaniment, harmonyChanged } from "../packages/workspace/harmony-adapt";
import {DRUM_KITS,DRUM_KIT_LABELS,drumBankRequirement,type DrumKit} from '../packages/sequencing/drum-samples';
import { CHORD_RHYTHMS, CHORD_RHYTHM_LABELS, chordNoteEvents, decodeRhythmicChord, encodeChordAttacks, generateChordRhythm, type ChordRhythm, type ChordAttack } from "../packages/music-theory/chord-rhythm";
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
  transformMotif,
  type HarmonyColour,
  type MotifTransform,
  type PatternMotion,
  type RiffEvent,
} from "../packages/prog";

import { useCloudProjects, saveRecording, getRecording, downloadBackup, restoreBackup } from "./workspace-storage";
import { DraftSession, DraftToolbar, useDraftState, useDraftPreview, type DraftPreview } from "./draft-session";
import { sectionFeel, buildSongPlan, type SongLayer } from "../packages/workspace/music";
import { buildSketchGroove, chooseSketchGroove, chooseSketchHarmony, heavyPowerVoicing, shapeSketchMotif, type SketchStyle } from "../packages/workspace/sketch-grammar";
import { exportSongMidi } from "../packages/workspace/song-export";
import { analyzeArrangement, preferredReturnSource, type ArrangementInsight } from "../packages/workspace/arrangement";
import { sortProjects, type Idea, type SongSection, type Project, type TrackMix, type SectionEnergy } from "../packages/workspace";
import { MUSICAL_DIRECTIONS, chooseDirectionHarmony, type MusicalDirection } from "../packages/workspace/directions";
import { developSection, type SectionRole } from "../packages/workspace/section-development";
import { Select } from "./components/select";
import { SoundEditor } from "./components/sound-editor";
import { SectionCreativeDialog } from "./components/section-creative-dialog";
import { varyIdeaData, varyNotes } from "../packages/workspace/variation";
import {
  generateBassPhrase,
  type BassDirection,
  type BassEvent,
  type BassMovement,
} from "../packages/workspace/bass";
import { VariationControls } from "./variation-controls";
import { isTheme, resolveInitialTheme, type Theme } from "../packages/theme";
import { isUiLanguage, LANGUAGE_STORAGE_KEY, observeUiLanguage, type UiLanguage } from "./i18n";

type IdeaDraft = Omit<Idea, "id" | "recordingId">;
type SaveIdea = (type: Idea["type"], name: string, detail: string, data?: string[], chooseDestination?: boolean, voice?: string) => void;
type ShareInfo = {
  projectId: string;
  ownerEmail: string;
  members: Array<{ email: string; role: string }>;
  canManage: boolean;
  currentRole: "owner" | "editor";
};
type Screen =
  | "home"
  | "projects"
  | "project"
  | "chords"
  | "explorer"
  | "melody"
  | "drums"
  | "bass"
  | "riff"
  | "metronome"
  | "settings";
type ChordDraft = { id: string; name: string; beats: number; pitches?: number[]; attacks?: ChordAttack[] };
const encodeChord = (c: ChordDraft) => `${c.name}|${c.beats}|${(c.pitches ?? decodeVoicing(c.name)).join(",")}|${encodeChordAttacks(c.attacks)}`;
const rhythmizeChords = (chords: ChordDraft[], seed: number, style: ChordRhythm = "adaptive", meter = "4/4", section?: SongSection) => {
  const drumIdea = section?.ideas.find(idea => idea.type === "drums");
  const drums = drumIdea ? decodeDrumIdea(drumIdea) : [];
  const rhythms = generateChordRhythm(chords, {seed,style,beatsPerBar:meterBeats(meter),kickSteps:drums.filter(hit=>hit.instrument==="kick").map(hit=>hit.step),snareSteps:drums.filter(hit=>hit.instrument==="snare").map(hit=>hit.step)});
  return chords.map((chord,index) => ({...chord,attacks:rhythms[index]}));
};
const freshSeed = () => Math.floor(Math.random() * 1000000000);
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
  id: SketchStyle;
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
type SketchOptions = {
  root: Root;
  mode: Mode;
  bpm: number;
  meter: string;
  includeMelody: boolean;
  includePattern: boolean;
  extendedForm: boolean;
  intensity: "mellow" | "steady" | "hard";
  direction?: MusicalDirection;
};

const SYNTH_VOICES: SynthVoice[] = [
  "air flute",
  "warm pad",
  "glass",
  "pluck",
  "analog pulse",
  "deep bass",
  "acoustic guitar",
  "distorted guitar",
];
const BASS_VOICES: BassVoice[] = ["deep bass", "808 bass", "sub bass"];
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
  "deep bass": 33,
  "808 bass": 38,
  "sub bass": 39,
  "acoustic guitar": 24,
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
const MODES: readonly Mode[] = SELECTABLE_MODES;
const SECTION_FEELS: readonly SectionEnergy[] = ["sparse","mellow","balanced","driving","powerful"];
const COLORS = ["mint", "violet", "amber", "blue", "coral"];
const SKETCH_PRESETS: SketchPreset[] = [
  {
    id: "emotive",
    label: "Mellow acoustic",
    copy: "Quiet drums, acoustic chords and room to breathe",
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
    id: "rock",
    label: "Straight rock",
    copy: "A firm backbeat, familiar lift and singable hook",
    accent: "▰",
    root: "C",
    mode: "ionian",
    bpm: 112,
    meter: "4/4",
    mood: "bright",
    groove: "steady",
    energy: "balanced",
    colour: "diatonic",
    opening: "tonic",
    tension: "balanced",
  },
  {
    id: "neo-soul",
    label: "Soulful groove",
    copy: "Syncopated pocket, warm harmony and active bass",
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
    id: "funk",
    label: "Funk pocket",
    copy: "Syncopated bass and drums around a lean modal vamp",
    accent: "♬",
    root: "E",
    mode: "mixolydian",
    bpm: 106,
    meter: "4/4",
    mood: "bright",
    groove: "syncopated",
    energy: "balanced",
    colour: "diatonic",
    opening: "tonic",
    tension: "balanced",
  },
  {
    id: "prog",
    label: "Progressive motion",
    copy: "Odd-meter accents, evolving motifs and riffs",
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
    label: "Heavy riffs",
    copy: "Driven guitars, forceful drums and low bass",
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
  degreePattern?: readonly number[],
): ChordDraft[] => {
  const progression = generateChordProgression({ root, mode, bars: count, complexity, seed, opening, tension, preferredPitchClasses, degreePattern });
  const symbols = progression.map((chord,index) => applyHarmonyColour(chord.name, root, colour, index));
  const voicings = voiceProgression(symbols,seed,voicing);
  return progression.map((chord, index) => {
      const wiggle = Math.round(
        (variation / 100) * Math.max(1, defaultBeats - 1),
      );
      const offset = wiggle
        ? (Math.abs(seed * 31 + index * 17) % (wiggle * 2 + 1)) - wiggle
        : 0;
      return {
        id: uid(),
        name: symbols[index],
        beats: Math.max(1, Math.min(16, defaultBeats + offset)),
        pitches: voicings[index],
      };
    },
  );
};
const decodeChordDrafts = (idea: Idea): ChordDraft[] =>
  (idea.data?.length ? idea.data : idea.detail.split(" · ")).map((value) => {
    return { id: uid(), ...decodeRhythmicChord(value) };
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
const BASS_PITCHES = Array.from({ length: 33 }, (_, index) => 23 + index);
const decodeBassIdea = (idea: Idea): BassEvent[] =>
  (idea.data ?? []).map((value) => {
    const [pitch, start, duration, accent] = value.split("|");
    return { pitch: Number(pitch) || 36, start: Number(start) || 0, duration: Number(duration) || .4, accent: accent === "1" };
  });
const encodeBassEvent = (event: BassEvent) => `${event.pitch}|${event.start}|${event.duration}|${event.accent ? 1 : 0}`;
const announceGenerated = (label: string) =>
  window.dispatchEvent(new CustomEvent("inspitivity-generation-complete", { detail: `${label} generated` }));
const bassRootPitch = (symbol: string) => {
  const pitchClass = notePitchClass(symbol) ?? 0;
  return pitchClass === 11 ? 23 : 24 + pitchClass;
};
const generateBassLine = (
  project: Project,
  section: SongSection | undefined,
  direction: BassDirection,
  movement: BassMovement,
  lockToKick: boolean,
  seed: number,
  density = .6,
  repeatRhythm = false,
): BassEvent[] => {
  const length = section ? sectionBeatTotal(section, project.meter) : meterBeats(project.meter) * 4;
  const { root, mode } = projectHarmony(project);
  const harmonyIdea = section?.ideas.find((idea) => idea.type === "chords");
  const harmony = (harmonyIdea?.data?.length ? harmonyIdea.data : harmonyIdea ? harmonyIdea.detail.split(" · ") : [`${root}|${length}`])
    .map((value) => { const [symbol, beats] = value.split("|"); return { symbol, beats: Math.max(.25, Number(beats) || 4) }; });
  const drums = section?.ideas.find((idea) => idea.type === "drums");
  const kickStarts = (drums?.data ?? [])
    .filter((value) => value.startsWith("kick|"))
    .map((value) => Number(value.split("|")[1]) / 4)
    .filter(Number.isFinite);
  const activity = section?.ideas
    .filter((idea) => idea.type === "melody" || idea.type === "riff")
    .reduce((sum, idea) => sum + (idea.data?.length ?? 0), 0) ?? 0;
  return generateBassPhrase({
    length,
    meter: project.meter,
    meterMap: section?.meterMap,
    root,
    mode,
    harmony,
    direction,
    movement,
    lockToKick,
    kickStarts,
    kickCycle: drumPatternBeats(drums?.data ?? [], meterBeats(project.meter)),
    otherActivity: activity / Math.max(1, length),
    density,
    repeatRhythm,
    seed,
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
      next.push({ instrument:"kick", step, velocity:.88 });
  });
  return next.map(hit=>({
    ...hit,
    velocity:Math.min(1,hit.velocity+(hit.instrument==="kick"?.08:hit.instrument==="snare"?.06:0)),
  })).sort((a,b) => a.step-b.step);
}

function buildPlayableSketch(preset: SketchPreset, options: SketchOptions, seed = freshSeed()): Project {
  const random = seededRandom(seed);
  const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)];
  const root=options.root,mode=options.mode,meter=options.meter,bpm=clampBpm(options.bpm);
  const beatsPerBar = meterBeats(meter);
  const forms: Record<SketchPreset["id"], Array<Array<{ name:string; color:string; energy:number }>>> = {
    emotive: [
      [{name:"Intro",color:"violet",energy:.32},{name:"Verse",color:"mint",energy:.48},{name:"Bloom",color:"amber",energy:.64}],
      [{name:"Verse",color:"blue",energy:.4},{name:"Lift",color:"violet",energy:.58},{name:"Release",color:"mint",energy:.34},{name:"Outro",color:"amber",energy:.24}],
      [{name:"Prelude",color:"blue",energy:.25},{name:"Verse",color:"mint",energy:.42},{name:"Refrain",color:"violet",energy:.62},{name:"Verse Return",color:"mint",energy:.48},{name:"Coda",color:"amber",energy:.3}],
      [{name:"Theme",color:"violet",energy:.38},{name:"Answer",color:"blue",energy:.5},{name:"Open Sky",color:"amber",energy:.68},{name:"Theme Return",color:"mint",energy:.36}],
    ],
    rock: [
      [{name:"Verse",color:"blue",energy:.48},{name:"Chorus",color:"coral",energy:.76},{name:"Verse Return",color:"mint",energy:.56}],
      [{name:"Intro",color:"mint",energy:.36},{name:"Verse",color:"blue",energy:.52},{name:"Chorus",color:"coral",energy:.78},{name:"Outro",color:"amber",energy:.42}],
      [{name:"Verse",color:"blue",energy:.52},{name:"Pre-Chorus",color:"violet",energy:.64},{name:"Chorus",color:"coral",energy:.82},{name:"Bridge",color:"amber",energy:.4},{name:"Chorus Return",color:"coral",energy:.84}],
    ],
    "neo-soul": [
      [{name:"Pocket A",color:"mint",energy:.48},{name:"Turn",color:"violet",energy:.58},{name:"Hook",color:"amber",energy:.66}],
      [{name:"Intro",color:"blue",energy:.36},{name:"Verse",color:"mint",energy:.52},{name:"Lift",color:"violet",energy:.62},{name:"Return",color:"amber",energy:.54}],
      [{name:"Pickup",color:"blue",energy:.4},{name:"Pocket A",color:"mint",energy:.52},{name:"Pocket B",color:"violet",energy:.58},{name:"Hook",color:"amber",energy:.7},{name:"Tag",color:"coral",energy:.46}],
      [{name:"Verse",color:"mint",energy:.46},{name:"Pre-Hook",color:"blue",energy:.6},{name:"Hook",color:"amber",energy:.68},{name:"Break",color:"violet",energy:.38}],
    ],
    funk: [
      [{name:"Pocket A",color:"mint",energy:.55},{name:"Pocket B",color:"violet",energy:.65},{name:"Hook Return",color:"amber",energy:.73}],
      [{name:"Intro",color:"blue",energy:.4},{name:"Verse",color:"mint",energy:.59},{name:"Break",color:"violet",energy:.38},{name:"Hook Return",color:"amber",energy:.76}],
      [{name:"Pocket A",color:"mint",energy:.55},{name:"Answer",color:"blue",energy:.64},{name:"Break",color:"violet",energy:.38},{name:"Hook",color:"amber",energy:.76},{name:"Pocket Return",color:"mint",energy:.68}],
    ],
    prog: [
      [{name:"Theme A",color:"violet",energy:.44},{name:"Development",color:"blue",energy:.6},{name:"Return",color:"amber",energy:.7}],
      [{name:"Intro",color:"mint",energy:.36},{name:"Theme",color:"violet",energy:.54},{name:"Contrast",color:"blue",energy:.46},{name:"Climax",color:"coral",energy:.76}],
      [{name:"Motif",color:"mint",energy:.42},{name:"Expansion",color:"violet",energy:.58},{name:"Half-Time",color:"blue",energy:.4},{name:"Motif Return",color:"amber",energy:.68},{name:"Resolve",color:"coral",energy:.52}],
      [{name:"Pulse",color:"blue",energy:.48},{name:"Theme A",color:"violet",energy:.58},{name:"Interlude",color:"mint",energy:.34},{name:"Theme B",color:"amber",energy:.66},{name:"Finale",color:"coral",energy:.8}],
    ],
    heavy: [
      [{name:"Intro",color:"blue",energy:.34},{name:"Riff A",color:"violet",energy:.62},{name:"Impact",color:"coral",energy:.82}],
      [{name:"Pulse",color:"mint",energy:.5},{name:"Riff A",color:"violet",energy:.7},{name:"Contrast",color:"blue",energy:.42},{name:"Return",color:"coral",energy:.86}],
      [{name:"Tension",color:"blue",energy:.4},{name:"Riff A",color:"violet",energy:.72},{name:"Breakdown",color:"coral",energy:.88},{name:"Clean Air",color:"mint",energy:.34},{name:"Final Impact",color:"amber",energy:.92}],
      [{name:"Stab",color:"coral",energy:.66},{name:"Verse",color:"violet",energy:.72},{name:"Hook",color:"amber",energy:.82},{name:"Drop",color:"blue",energy:.9}],
    ],
  };
  const preferredForms=forms[preset.id].filter(candidate=>options.extendedForm?candidate.length>=5:candidate.length<=4);
  const form = pick(preferredForms.length?preferredForms:forms[preset.id]);
  type SketchRelation="theme"|"develop"|"contrast"|"return";
  const relationFor=(name:string,index:number):SketchRelation=>{
    if(index===0)return "theme";
    if(/return|outro|coda|tag|resolve|final/i.test(name) || form.slice(0,index).some(section=>section.name===name))return "return";
    if(/contrast|break|clean|interlude|half-time|release|drop/i.test(name))return "contrast";
    if(index===form.length-1)return "return";
    return "develop";
  };
  const themeCount=4;
  const feeling=options.direction?MUSICAL_DIRECTIONS[options.direction]:undefined;
  const baseHarmony=chooseSketchHarmony(preset.id,mode,seed);
  const harmonicTheme=options.direction?chooseDirectionHarmony(options.direction,seed):baseHarmony;
  const harmonicContrast=options.direction?chooseDirectionHarmony(options.direction,seed,1):chooseSketchHarmony(preset.id,mode,seed,1);
  const pocket=chooseSketchGroove(preset.id,beatsPerBar,seed);
  const themeChords=makeChordDrafts(
    root,mode,themeCount,preset.id==="neo-soul"||preset.id==="prog"?"advanced":preset.id==="rock"||preset.id==="heavy"?"simple":"medium",
    seed,beatsPerBar,0,"diatonic",preset.opening,
    preset.id==="emotive"?"open":"mixed",feeling?.tension??preset.tension,[],harmonicTheme.degrees,
  );
  const themePitchClasses=themeChords.map(chord=>notePitchClass(chord.name)).filter((pitch):pitch is number=>pitch!==null);
  const coreMotif=fitMelodyToChords(shapeSketchMotif(alignPhrase(generateMelody({
    root,mode,notes:feeling?Math.round(8+feeling.density*20):preset.id==="emotive"?12:16,density:feeling?.density??(preset.id==="emotive"?.42:.58),
    mood:feeling?.mood??preset.mood,seed:seed+7,shape:preset.id==="heavy"?"hook":preset.id==="emotive"?"floating":"answer",
  }),themeCount*beatsPerBar),preset.id,beatsPerBar,seed+7),themeChords);
  const coreRiff=options.includePattern?fitMelodyToChords(alignPhrase(generateProgRiff({
    root,mode,beats:beatsPerBar*themeCount,cycle:preset.id==="heavy"?7:5,
    grouping:preset.id==="heavy"?"3+2+2":"3+3+2",density:preset.id==="heavy"?.72:.48,
    seed:seed+23,startOffset:preset.id==="heavy"?.25:.5,motion:preset.id==="heavy"?"anchor":"orbit",
  }).map(note=>({...note,note:midiNoteName(note.pitch),velocity:note.accent?.8:.62})),beatsPerBar*themeCount),themeChords):[];
  const hard=options.intensity==="hard",mellow=options.intensity==="mellow";
  const chordVoice:SynthVoice=hard?"distorted guitar":mellow?"acoustic guitar":preset.id==="emotive"?"acoustic guitar":preset.id==="neo-soul"?"warm pad":preset.id==="funk"?"pluck":preset.id==="rock"?"distorted guitar":"glass";
  const melodyVoice:SynthVoice=hard?"pluck":mellow?"air flute":preset.id==="neo-soul"?"glass":"analog pulse";
  const patternVoice:SynthVoice=hard?"distorted guitar":preset.id==="prog"?"analog pulse":"pluck";
  const drumVoice:DrumKit=preset.id==="heavy"||preset.id==="prog"?hard?"prog metal":"rock"
    :preset.id==="rock"?hard?"rock":"roomy rock"
    :preset.id==="emotive"?mellow?"dark acoustic":"acoustic studio":"dry studio";
  const bassVoice:BassVoice=hard||preset.id==="funk"||preset.id==="neo-soul"?"deep bass":mellow?"sub bass":"808 bass";
  const mainBars=options.extendedForm?pick([4,8]):4;
  const sections = form.map((formSection, sectionIndex): SongSection => {
    const sectionSeed = seed + sectionIndex * 17;
    const finalSection = sectionIndex === form.length - 1;
    const relation=relationFor(formSection.name,sectionIndex);
    const bars=relation==="theme"||(/outro|coda|tag/i.test(formSection.name)&&finalSection)?Math.min(4,mainBars):mainBars;
    const density=Math.max(.2,Math.min(.95,formSection.energy+(hard?.13:mellow?-.15:0)+(feeling?(feeling.density-.53)*.7:0)));
    const voicing:VoicingStyle=relation==="return"?"open":relation==="contrast"?"drop 2":"mixed";
    const returnVoicings=voiceProgression(themeChords.map(chord=>chord.name),sectionSeed,voicing);
    const sourceChords=relation==="contrast"?makeChordDrafts(
      root,mode,themeCount,preset.id==="neo-soul"||preset.id==="prog"?"advanced":preset.id==="rock"||preset.id==="heavy"?"simple":"medium",
      seed+101,beatsPerBar,0,"diatonic","surprise",voicing,
      preset.tension,themePitchClasses,harmonicContrast.degrees,
    ):themeChords.map((chord,index)=>({...chord,id:uid(),pitches:returnVoicings[index]}));
    const rhythmStyle:ChordRhythm=feeling?feeling.rhythm:mellow||preset.id==="emotive"?(relation==="contrast"?"sparse":"sustain")
      :preset.id==="rock"?(formSection.energy>.7?"eighths":"quarters")
      :preset.id==="funk"?"offbeat":preset.id==="neo-soul"?"syncopated"
      :hard?"driving":relation==="contrast"?"sparse":"adaptive";
    const sectionEnergy:GrooveEnergy=options.direction==="mellow"?"mellow":options.direction==="driving"&&!mellow?"powerful":mellow?"mellow":hard?(density>.6?"powerful":"balanced"):formSection.energy<.43?"mellow":formSection.energy>.72?"powerful":"balanced";
    const drums=buildSketchGroove(pocket,beatsPerBar,bars,relation==="return"?seed+13:sectionSeed+13,sectionEnergy,relation);
    const rhythmContext:SongSection={id:"rhythm",name:formSection.name,bars,color:formSection.color,ideas:[{id:"drum",type:"drums",name:pocket.name,detail:"",data:drums.map(hit=>`${hit.instrument}|${hit.step}|${hit.velocity}|${beatsPerBar*bars}`)}]};
    const voicedChords=preset.id==="heavy"?sourceChords.map(chord=>({...chord,pitches:heavyPowerVoicing(chord.name)})):sourceChords;
    const chords=rhythmizeChords(voicedChords,relation==="return"?seed:sectionSeed,rhythmStyle,meter,rhythmContext);
    const motifSource=relation==="contrast"
      ?shapeSketchMotif(alignPhrase(generateMelody({root,mode,notes:Math.max(8,Math.round(12*density)),density:Math.min(.65,density),mood:feeling?.mood??preset.mood,seed:seed+107,shape:"answer"}),themeCount*beatsPerBar),preset.id,beatsPerBar,seed+107)
      :coreMotif;
    const melody=fitMelodyToChords(motifSource,chords).map(note=>({...note,velocity:Math.max(.48,Math.min(.82,.5+density*.35))}));
    const riffLeads=options.includePattern&&sectionIndex>0&&(hard||(!mellow&&formSection.energy>=.45))&&(relation!=="return"||preset.id==="heavy");
    const riff=riffLeads?fitMelodyToChords(coreRiff,chords):[];
    const ideas: Idea[] = [
      { id:uid(),type:"chords",name:`${formSection.name} · ${relation==="contrast"?harmonicContrast.name:harmonicTheme.name}`,voice:chordVoice,detail:chords.map(chord=>chord.name).join(" · "),data:chords.map(encodeChord) },
      { id:uid(),type:"drums",name:`${formSection.name} · ${pocket.name}`,voice:drumVoice,detail:`${drums.length} hits · ${meter}`,data:drums.map(hit=>`${hit.instrument}|${hit.step}|${hit.velocity}|${beatsPerBar*bars}`) },
    ];
    if(options.includeMelody&&!riffLeads)ideas.splice(1,0,{ id:uid(),type:"melody",name:`${formSection.name} motif`,voice:melodyVoice,detail:melody.map(note=>note.note).join(" · "),data:melody.map(note=>`${note.note}|${note.start}|${note.duration}|${note.pitch}`) });
    if(riff.length) ideas.push({ id:uid(),type:"riff",name:`${formSection.name} pulse`,voice:patternVoice,detail:`${riff.length} notes · ${meter}`,data:riff.map(note=>`${note.pitch}|${note.start}|${note.duration}|${note.accent?1:0}|${note.muted?1:0}`) });
    const section: SongSection = { id:uid(),name:formSection.name,bars,color:formSection.color,ideas,meterMap:Array.from({length:bars},()=>meter),energy:sectionEnergy };
    const sketchContext: Project = { id:"preview",name:preset.label,bpm,meter,key:formatProjectKey(root,mode),updated:0,sections:[section] };
    const bass = generateBassLine(
      sketchContext,
      section,
      mellow||relation==="theme"&&!hard&&preset.id==="emotive" ? "sustained" : hard||preset.id==="prog" ? "progressive" : "groove",
      hard||riff.length ? "rooted" : preset.id==="neo-soul" || preset.id==="prog" || preset.id==="funk" ? "melodic" : "supportive",
      true,
      relation==="return"?seed+29:sectionSeed+29,
      .35+density*.45,
      true,
    );
    ideas.push({ id:uid(),type:"bass",name:`${formSection.name} bass`,detail:`${bass.length} notes · follows harmony and kick`,data:bass.map(encodeBassEvent),voice:bassVoice });
    section.mix=automaticSectionMix(section,sketchContext);
    return section;
  });
  return {
    id: uid(),
    name: `${preset.label} sketch`,
    bpm,
    meter,
    key: formatProjectKey(root, mode),
    updated: Date.now(),
    sections,
  };
}

type GuidedSectionDirection = "continue" | "contrast" | "return";
function buildGuidedSection(
  project: Project,
  name: string,
  energy: SectionEnergy,
  direction: GuidedSectionDirection,
  returnSourceId?: string,
): SongSection {
  const seed=freshSeed(), random=seededRandom(seed), previous=project.sections.at(-1);
  const source=project.sections.find(section=>section.id===returnSourceId) ?? previous;
  if(source?.ideas.some(idea=>["chords","drums","bass","melody","riff"].includes(idea.type)&&idea.data?.length)){
    const role:SectionRole=direction==="return"?"return":direction==="contrast"?"bridge":energy==="mellow"||energy==="sparse"?"verse":"chorus";
    const developed=developSection(project,source,role,seed,uid);
    const section={...developed,name,energy};return {...section,mix:automaticSectionMix(section,project)};
  }
  const {root,mode}=projectHarmony(project), beatsPerBar=meterBeats(project.meter);
  const heavy=source?.ideas.some(idea=>idea.type==="riff"||idea.voice==="distorted guitar") ?? false;
  const bars=direction==="return" && source ? source.bars : [4,8,8][Math.floor(random()*3)];
  const sourceHarmony=source?.ideas.find(idea=>idea.type==="chords");
  const chords=direction==="return" && sourceHarmony
    ? decodeChordDrafts(sourceHarmony).map((chord,index)=>({...chord,id:uid(),pitches:voiceChord(chord.name,seed+index*41,index%2?"open":"mixed")}))
    : rhythmizeChords(makeChordDrafts(
        root,mode,4,heavy?"advanced":"medium",seed,beatsPerBar,
        0,direction==="contrast"?"modal interchange":"diatonic",
        direction==="return"?"tonic":direction==="contrast"?"surprise":"away",
        heavy?"open":"mixed",energy==="mellow"||energy==="sparse"?"smooth":"balanced",sectionPitchContext(previous,"chords"),
      ),seed,energy==="sparse"||energy==="mellow"?"sparse":energy==="driving"||heavy?"driving":"adaptive",project.meter,previous);
  const previousMelody=source?.ideas.find(idea=>idea.type==="melody");
  const mood:MelodyMood=energy==="mellow"||energy==="sparse"?(mode==="major"?"calm":"melancholic"):energy==="powerful"?(heavy?"dark":"bright"):"calm";
  const melody=direction==="return" && previousMelody?.data?.length
    ? fitMelodyToChords(decodeMelodyIdea({...previousMelody,data:varyIdeaData("melody",previousMelody.data,seed+7)}),chords)
    : fitMelodyToChords(alignPhrase(generateMelody({
        root,mode,notes:energy==="sparse"?9:energy==="mellow"?14:energy==="powerful"?28:energy==="driving"?24:20,
        density:energy==="sparse"?.29:energy==="mellow"?.42:energy==="powerful"?.76:energy==="driving"?.7:.58,mood,seed:seed+7,
        shape:direction==="return"?"hook":direction==="contrast"?"answer":"flow",
      }),beatsPerBar*4),chords);
  const groove:DrumStyle=heavy?(direction==="contrast"?"linear":"djent"):energy==="driving"?"driving":(direction==="contrast"?"syncopated":"steady");
  const grooveEnergy:GrooveEnergy=energy==="sparse"?"mellow":energy==="driving"?"powerful":energy;
  let drums=generateDrumLoop({beatsPerBar,density:energy==="sparse"?.26:energy==="mellow"?.4:energy==="powerful"?.78:energy==="driving"?.72:.6,style:groove,energy:grooveEnergy,seed:seed+13,bars:Math.min(8,bars)});
  drums=reinforceDrumAccents(drums,melody.filter((_,index)=>index%4===0).map(note=>note.start),beatsPerBar*bars*4);
  const returnDrums=direction==="return"?source?.ideas.find(idea=>idea.type==="drums"&&idea.data?.length):undefined;
  const chordVoice:SynthVoice=heavy?"distorted guitar":energy==="mellow"||energy==="sparse"?"glass":"warm pad";
  const ideas:Idea[]=[
    {id:uid(),type:"chords",name:`${name} harmony`,detail:chords.map(chord=>chord.name).join(" · "),data:chords.map(encodeChord),voice:chordVoice},
    {id:uid(),type:"melody",name:`${name} motif`,detail:melody.map(note=>note.note).join(" · "),data:melody.map(note=>`${note.note}|${note.start}|${note.duration}|${note.pitch}`),voice:heavy?"pluck":"air flute"},
    {id:uid(),type:"drums",name:`${name} pocket`,detail:returnDrums?.detail??`${drums.length} hits · ${project.meter}`,data:returnDrums?.data?[...returnDrums.data]:drums.map(hit=>`${hit.instrument}|${hit.step}|${hit.velocity}|${beatsPerBar*Math.min(8,bars)}`),voice:returnDrums?.voice??(heavy?"prog metal":"rock")},
  ];
  const section:SongSection={
    id:uid(),name,bars,color:COLORS[project.sections.length%COLORS.length],ideas,
    meterMap:direction==="return"&&source?.meterMap?[...source.meterMap]:Array.from({length:bars},()=>project.meter),energy,
  };
  const context:Project={...project,sections:[...project.sections,section]};
  const bass=generateBassLine(context,section,heavy?"progressive":energy==="mellow"||energy==="sparse"?"sustained":"groove",heavy?"rooted":"supportive",true,seed+29);
  ideas.push({id:uid(),type:"bass",name:`${name} bass`,detail:`${bass.length} notes · generated with the section`,data:bass.map(encodeBassEvent),voice:"deep bass"});
  const returnRiff=direction==="return"?source?.ideas.find(idea=>idea.type==="riff"&&idea.data?.length):undefined;
  if(returnRiff?.data) {
    const data=varyIdeaData("riff",returnRiff.data,seed+37);
    ideas.push({id:uid(),type:"riff",name:`${name} pattern`,detail:`${data.length} notes · returns to ${source?.name} motif`,data,voice:returnRiff.voice});
  } else if(heavy||energy==="powerful"||energy==="driving") {
    const riff=fitMelodyToChords(alignPhrase(generateProgRiff({root,mode,beats:beatsPerBar*4,cycle:beatsPerBar===7?7:5,grouping:beatsPerBar===7?"2+2+3":"3+3+2",density:energy==="powerful"?.72:.52,seed:seed+37,startOffset:.5,motion:direction==="contrast"?"rise":"orbit"}).map(note=>({...note,note:midiNoteName(note.pitch),velocity:note.accent?.8:.62})),beatsPerBar*4),chords);
    ideas.push({id:uid(),type:"riff",name:`${name} pattern`,detail:`${riff.length} notes · supports the generated harmony`,data:riff.map(note=>`${note.pitch}|${note.start}|${note.duration}|${note.accent?1:0}|${note.muted?1:0}`),voice:heavy?"distorted guitar":"analog pulse"});
  }
  section.mix=automaticSectionMix(section,context);
  return section;
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
  const groups: { label: string; destinations: [Screen, React.ReactNode, string][] }[] = [
    { label: "Workspace", destinations: [["home", "⌂", "Studio"], ["projects", "▱", "Projects"], ["explorer", "♯", "Chord explorer"], ["metronome", "♩", "Metronome"]] },
    { label: "Preferences", destinations: [
      ["settings", <GearIcon key="settings" />, "Settings"],
    ] },
  ];
  const mobilePrimary = new Set<Screen>(["home", "projects", "explorer", "metronome", "settings"]);
  const creating = ["drums", "chords", "bass", "melody", "riff"].includes(screen);
  const navigateFromMenu = (target: Screen) => { setOpen(false); go(target); };
  return <>
    <button className="studio-nav-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "×" : "☰"}</button>
    <button className={`studio-nav-backdrop ${open ? "is-open" : ""}`} aria-label="Close navigation" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
    <nav className={`studio-nav ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`} aria-label="Main navigation">
    <button className="studio-nav-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? "›" : "‹"}</button>
    <button className="studio-brand" aria-label="Inspitivity studio" onClick={() => navigateFromMenu("home")}><span className="brand-mark"><img src="/icon-192.png" alt="" /></span><span>inspitivity<small>SONGWRITING STUDIO</small></span></button>
    <button className="studio-create" aria-label="Create new" onClick={() => { setOpen(false); create(); }}><b>＋</b><span>Create new</span></button>
    <div className="studio-destinations">
      <button className="studio-mobile-create" aria-label="Create" aria-current={creating ? "page" : undefined} onClick={create}><b aria-hidden="true">＋</b><span>Create</span></button>
      {groups.map(group => <div className="nav-group" key={group.label}>
        <span className="nav-group-label">{group.label}</span>
        {group.destinations.map(([target, icon, label]) =>
          <button className={`nav-${target} ${mobilePrimary.has(target) ? "" : "nav-mobile-hidden"}`} key={target} aria-label={label} title={label} aria-current={screen === target || target === "projects" && screen === "project" ? "page" : undefined}
            onClick={() => navigateFromMenu(target)}><b aria-hidden="true">{icon}</b><span>{label}</span></button>
        )}
      </div>)}
    </div>
    <span className="studio-nav-foot">A space for your next song.</span>
    </nav>
  </>;
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
      note.muted,
    ),
  );
}


function publishPlayhead(seconds: number | null) {
  window.dispatchEvent(new CustomEvent("inspitivity-playhead",{detail:seconds}));
}
function usePlaybackPosition(bpm: number, length: number, resolution = 0) {
  const [seconds,setSeconds]=useState<number|null>(null);
  useEffect(()=>{
    const receive=(event:Event)=>{
      const next=(event as CustomEvent<number|null>).detail;
      setSeconds(next===null?null:resolution ? Math.floor(next*bpm/60/resolution)*resolution*60/bpm : next);
    };
    window.addEventListener("inspitivity-playhead",receive);
    return ()=>window.removeEventListener("inspitivity-playhead",receive);
  },[bpm,resolution]);
  return seconds===null?null:playbackBeat(seconds,bpm,length);
}
function PlaybackCursor({bpm,length,inset=0,span=100}:{bpm:number;length:number;inset?:number;span?:number}) {
  const position=usePlaybackPosition(bpm,length);
  return position===null?null:<i className="editor-playhead" aria-label={`Playback beat ${Math.floor(position)+1}`} style={{left:`${inset+position/Math.max(.25,length)*span}%`}} />;
}

function useLoopTransport(
  playOnce: () => void,
  durationMs: number,
  stopAudio: () => void,
  unlockAudio: () => Promise<boolean>,
  clickOptions?: {enabled:boolean;beatSeconds:number;meter:string},
) {
  const clickEngine=useAudioEngine();
  const clickRef=useRef(clickOptions);
  useEffect(()=>{clickRef.current=clickOptions;},[clickOptions]);
  const clickTick=useRef<(()=>void)|null>(null);
  const [mode, setMode] = useState<"stopped" | "once" | "loop">("stopped");
  const modeRef = useRef<"stopped" | "once" | "loop">("stopped");
  const timer = useRef<number | null>(null);
  const visualTimer = useRef<ReturnType<typeof setInterval>|null>(null);
  const startGeneration = useRef(0);
  const playRef = useRef(playOnce);
  const durationRef = useRef(durationMs);
  useEffect(() => {
    playRef.current = playOnce;
    durationRef.current = durationMs;
  }, [playOnce, durationMs]);
  const clear = useCallback(() => {
    const ownedPlayhead=visualTimer.current!==null;
    startGeneration.current++;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if(visualTimer.current)clearInterval(visualTimer.current);
    visualTimer.current=null;
    clickTick.current=null;clickEngine.stopAll();
    if(ownedPlayhead)publishPlayhead(null);
    stopAudio();
  }, [stopAudio,clickEngine]);
  const beginCycle=useCallback(()=>{
    const origin=clickEngine.get().currentTime;
    const cursor=new QuarterClickScheduler(clickRef.current?.enabled??false);
    clickEngine.stopAll();
    const tick=()=>{
      const now=clickEngine.get().currentTime;
      const options=clickRef.current;
      if(options)for(const beat of cursor.collect(options.enabled,now-origin,options.beatSeconds,durationRef.current/1000)){
        const accent=beat%(Number(options.meter.split("/")[0])||4)===0;
        clickEngine.tone(accent?88:80,Math.max(0,origin+beat*options.beatSeconds-clickEngine.get().currentTime),.04,accent?.11:.055,"click");
      }
    };
    clickTick.current=tick;tick();playRef.current();
    if(visualTimer.current)clearInterval(visualTimer.current);
    visualTimer.current=setInterval(()=>{tick();publishPlayhead(Math.max(0,(clickEngine.get().currentTime)-origin));},25);
  },[clickEngine]);
  useEffect(()=>{
    if(!clickOptions?.enabled)clickEngine.stopAll();
    clickTick.current?.();
  },[clickOptions?.enabled,clickEngine]);
  const stop = useCallback(() => {
    clear();
    modeRef.current = "stopped";
    setMode("stopped");
  }, [clear]);
  const start = useCallback(
    async (loop: boolean) => {
      clear();
      modeRef.current = "stopped";
      window.dispatchEvent(new Event("inspitivity-solo-preview"));
      const token=++startGeneration.current;
      const unlocked = await unlockAudio();
      if(token !== startGeneration.current) return;
      if (!unlocked) {
        modeRef.current = "stopped";
        setMode("stopped");
        return;
      }
      modeRef.current = loop ? "loop" : "once";
      setMode(modeRef.current);
      const run = () => {
        beginCycle();
        timer.current = window.setTimeout(
          () => {if(loop)run();else {clear();modeRef.current="stopped";setMode("stopped");}},
          Math.max(120, durationRef.current),
        );
      };
      run();
    },
    [clear, unlockAudio,beginCycle],
  );
  const refresh = useCallback(async () => {
    if(modeRef.current==="stopped")return;
    const activeMode=modeRef.current;
    const token=++startGeneration.current;
    const unlocked=await unlockAudio();
    if(!unlocked||token!==startGeneration.current||modeRef.current!==activeMode)return;
    clear();
    modeRef.current=activeMode;
    const loop=activeMode==="loop";
    const run=()=>{
      beginCycle();
      timer.current=window.setTimeout(()=>{if(loop)run();else {clear();modeRef.current="stopped";setMode("stopped");}},Math.max(120,durationRef.current));
    };
    run();
  },[clear,unlockAudio,beginCycle]);
  useEffect(() => { window.addEventListener("inspitivity-context-play",stop); return () => { window.removeEventListener("inspitivity-context-play",stop); clear(); }; }, [clear,stop]);
  return { mode, start, stop, refresh };
}

export default function InspitivityApp({ account, signOutPath }: {
  account: { userId: string; displayName: string; email: string };
  signOutPath: string;
}) {
  const [projects, setProjects, cloud] = useCloudProjects(STARTER_PROJECTS, account.userId);
  const [theme, setTheme] = useTheme();
  const [language, setLanguage] = useState<UiLanguage>("en");
  const appRef = useRef<HTMLElement>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isUiLanguage(saved)) setLanguage(saved);
    } catch { /* English remains the default */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    return appRef.current ? observeUiLanguage(appRef.current, language) : undefined;
  }, [language]);
  const changeLanguage = (next: UiLanguage) => {
    setLanguage(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* session-only preference */ }
  };
  const [compact, setCompact] = useState(false);
  useEffect(() => { try { setCompact(localStorage.getItem("inspitivity-density") === "compact"); } catch { /* default density */ } }, []);
  const changeCompact = (value:boolean) => { setCompact(value); try { localStorage.setItem("inspitivity-density", value ? "compact" : "comfortable"); } catch { /* session-only preference */ } };
  const [previews, setPreviews] = useState<Record<string, DraftPreview>>({});
  const phoneInstall = usePhoneInstall();
  const [screen, setScreen] = useState<Screen>("home");
  useEffect(() => { window.scrollTo(0, 0); }, [screen]);
  const [selectedId, setSelectedId] = useState("midnight");
  const [modal, setModal] = useState<"project" | "create" | "record" | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToShare, setProjectToShare] = useState<Project | null>(null);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [pendingSave, setPendingSave] = useState<IdeaDraft | null>(null);
  const [pendingHarmony, setPendingHarmony] = useState<{projectId:string;sectionId:string;idea:Idea;existingId:string}|null>(null);
  const savedDraftId = useRef<string | null>(null);
  const [draftSectionId, setDraftSectionId] = useState<string | null>(null);
  const [returnToArrangement, setReturnToArrangement] = useState(false);
  const [standaloneProject, setStandaloneProject] = useState<Project>({ id:"standalone", name:"Standalone idea", bpm:120, meter:"4/4", key:"C ionian", updated:0, sections:[] });
  const [toolMetronomeEnabled, setToolMetronomeEnabled] = useState(false);
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];
  const publishPreview = useCallback((preview: DraftPreview) => {
    if (!returnToArrangement) return;
    const key = `${selected?.id}/${draftSectionId ?? "scratch"}/${preview.type}`;
    setPreviews(current => JSON.stringify(current[key]) === JSON.stringify(preview) ? current : { ...current, [key]: preview });
  }, [selected?.id, draftSectionId, returnToArrangement]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2400);
  }, []);
  useEffect(() => {
    const receive = (event: Event) => notify((event as CustomEvent<string>).detail || "New part generated");
    window.addEventListener("inspitivity-generation-complete", receive);
    window.addEventListener("inspitivity-notice", receive);
    return () => {
      window.removeEventListener("inspitivity-generation-complete", receive);
      window.removeEventListener("inspitivity-notice", receive);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [notify]);
  useEffect(() => {
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.classList.contains("modal-layer")) {
        event.preventDefault();
        const dismiss = target.querySelector<HTMLButtonElement>(".modal-close, [data-dialog-dismiss]");
        if (dismiss && !dismiss.disabled) dismiss.click();
      }
      for (const panel of document.querySelectorAll<HTMLDetailsElement>(
        ".section-player .section-mixer[open], .section-player .transport-preferences[open], .project-options[open], .part-actions[open], .section-more-actions[open]",
      )) {
        if (!panel.contains(target)) panel.open = false;
      }
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePointer);
  }, []);
  const navigate = (next: Screen) => {
    if(next === "explorer") {
      window.dispatchEvent(new Event("inspitivity-solo-preview"));
      window.dispatchEvent(new Event("inspitivity-context-play"));
      setReturnToArrangement(false); setDraftSectionId(null); setEditingIdea(null); setScreen(next); return;
    }
    if(screen==="project"&&["chords","explorer","melody","drums","bass","riff","metronome"].includes(next))setReturnToArrangement(true);
    if (next !== screen) {
      setEditingIdea(selected?.sections.find(s => s.id === draftSectionId)?.ideas.find(i => i.type === next) ?? null);
      savedDraftId.current = null;
    }
    if (!["chords", "explorer", "melody", "drums", "bass", "riff", "metronome"].includes(next))
      { setReturnToArrangement(false); setDraftSectionId(null); }
    setScreen(next);
  };
  const openProject = (id: string) => {
    setSelectedId(id);
    navigate("project");
  };
  const createStandalone = (next: Screen) => {
    window.dispatchEvent(new Event("inspitivity-solo-preview"));
    window.dispatchEvent(new Event("inspitivity-context-play"));
    savedDraftId.current = null;
    setEditingIdea(null);
    setDraftSectionId(null);
    setReturnToArrangement(false);
    setToolMetronomeEnabled(false);
    setStandaloneProject({ id:`standalone-${uid()}`, name:"Standalone idea", bpm:120, meter:"4/4", key:"C ionian", updated:0, sections:[] });
    setScreen(next);
  };
  const createProject = (name: string, bpm: number, key: string, meter: string) => {
    const project: Project = {
      id: uid(),
      name,
      bpm: bpm > 0 ? clampBpm(bpm) : 120,
      meter,
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
  const launchSketch = (project:Project) => {
    setProjects((items) => [project, ...items]);
    setSelectedId(project.id);
    setScreen("project");
    notify(`${project.name} is ready to edit`);
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
    if (chooseDestination || !returnToArrangement) {
      setPendingSave({ type, name, detail, data, voice });
      return;
    }
    if (!selected) return;
    const destination=selected.sections.find(section=>section.id===draftSectionId);
    const existingId = editingIdea?.type === type ? editingIdea.id : savedDraftId.current
      ?? (type==="chords"?destination?.ideas.find(idea=>idea.type==="chords")?.id:null);
    const previous=destination?.ideas.find(idea=>idea.id===existingId);
    if(type==="chords"&&destination&&previous?.data?.length&&data?.length
      &&harmonyChanged(previous.data,data)&&destination.ideas.some(idea=>["bass","melody","riff"].includes(idea.type))){
      setPendingHarmony({projectId:selected.id,sectionId:destination.id,existingId:existingId!,idea:{id:existingId!,type,name,detail,data,voice}});
      return;
    }
    if (existingId) {
      updateSelected((project) => ({
        ...project,
        sections: project.sections.map((section) => ({
          ...section,
          ideas: section.ideas.map((idea) =>
            idea.id === existingId
              ? { ...idea, type, name, detail, data, voice, cycleBeats:JSON.stringify(data)===JSON.stringify(idea.data)?idea.cycleBeats:undefined }
              : idea,
          ),
        })),
      }));
      window.dispatchEvent(new Event("inspitivity-draft-saved"));
      notify(`Saved changes to ${name}`);
      return;
    }
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
  const resolveHarmony=(choice:"adapt"|"keep"|"revert")=>{
    if(!pendingHarmony)return;
    const pending=pendingHarmony;
    setPendingHarmony(null);
    if(choice==="revert")return;
    setProjects(projects=>projects.map(project=>project.id!==pending.projectId?project:{...project,updated:Date.now(),sections:project.sections.map(section=>{
      if(section.id!==pending.sectionId)return section;
      const shaped=choice==="adapt"?adaptAccompaniment(section,pending.idea.data??[]):section;
      return {...shaped,ideas:shaped.ideas.map(idea=>idea.id===pending.existingId?pending.idea:idea)};
    })}));
    window.dispatchEvent(new Event("inspitivity-draft-saved"));
    notify(choice==="adapt"?"Chords saved · accompaniment adapted":"Chords saved · accompaniment kept");
  };
  const saveIdeaTo = (projectId: string, sectionId: string) => {
    if (!pendingSave) return;
    const project = projects.find((item) => item.id === projectId);
    const section = project?.sections.find((item) => item.id === sectionId);
    if (!project || !section) return;
    const draft = pendingSave;
    const existing=draft.type==="chords"?section.ideas.find(idea=>idea.type==="chords"):undefined;
    if(existing?.data?.length&&draft.data?.length&&harmonyChanged(existing.data,draft.data)
      &&section.ideas.some(idea=>["bass","melody","riff"].includes(idea.type))){
      setPendingSave(null);
      setPendingHarmony({projectId,sectionId,existingId:existing.id,idea:{id:existing.id,...draft}});
      return;
    }
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
    tool: "chords" | "melody" | "drums" | "bass" | "riff",
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
    if(!returnToArrangement)setDraftSectionId(null);
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
      idea.type === "riff"
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
  const editorProject = returnToArrangement ? (musicProject ?? selected ?? standaloneProject) : standaloneProject;
  const updateEditorProject = returnToArrangement ? updateSelected : setStandaloneProject;

  return (
    <main ref={appRef} data-density={compact ? "compact" : "comfortable"} className={`app-shell ${screen}-screen ${returnToArrangement ? "inside-project" : ""}`}>
      <div className="studio-workspace">
      <div className="sync-status">
        <div className="account-sync"><b>{account.displayName}</b><span role="status">{cloud.status}</span></div>
        <div className="account-actions"><button onClick={() => void cloud.sync()}>Sync now</button><a href={signOutPath} target="_top">Sign out</a></div>
      </div>
      {selected && (screen === "project" || returnToArrangement) && ["project", "drums", "chords", "explorer", "melody", "bass", "riff", "metronome"].includes(screen) && <SharedSectionPlayer project={selected} previews={previews} activeSectionId={draftSectionId} activeTool={screen === "explorer" ? "chords" : screen} go={navigate} chooseSection={(id) => { savedDraftId.current=null; setDraftSectionId(id); setEditingIdea(selected.sections.find(section=>section.id===id)?.ideas.find(idea=>idea.type===(screen === "explorer" ? "chords" : screen))??null); }} updateProject={updateSelected} />}
      <DraftSession key={`${returnToArrangement ? selected?.id : standaloneProject.id}/${draftSectionId ?? "scratch"}/${screen}/${editingIdea?.id ?? "new"}`} id={`${returnToArrangement ? selected?.id : standaloneProject.id}/${draftSectionId ?? "scratch"}/${screen}/${editingIdea?.id ?? "new"}`} publish={publishPreview}>
      {screen === "home" && (
        <Home
          projects={projects}
          openProject={openProject}
          go={navigate}
          create={() => setModal("project")}
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
          selectedSectionId={draftSectionId}
          setSelectedSectionId={setDraftSectionId}
          update={updateSelected}
          back={() => navigate("projects")}
          record={() => setModal("record")}
          openSectionTool={openSectionTool}
          editIdea={editArrangementIdea}
          deleteProject={() => setProjectToDelete(selected)}
          shareProject={() => setProjectToShare(selected)}
          clearAssetDraft={(sectionId,idea,removeDraft=false) => {
            window.dispatchEvent(new Event("inspitivity-solo-preview"));
            setPreviews(current=>Object.fromEntries(Object.entries(current).filter(([key])=>key!==`${selected.id}/${sectionId}/${idea.type}` && key!==`${selected.id}/scratch/${idea.type}`)));
            if(removeDraft) for(const suffix of ["new",idea.id]) {
              try { localStorage.removeItem(`inspitivity-draft-v1:${selected.id}/${sectionId}/${idea.type}/${suffix}`); } catch { /* device storage unavailable */ }
            }
          }}
        />
      )}
      {screen === "explorer" && <ChordExplorer back={()=>navigate("home")} />}
      {screen === "chords" && (
        <ChordTool
          key={`${editingIdea?.id ?? "new-chords"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "chords" ? editingIdea : undefined}
          project={editorProject}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateEditorProject}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "melody" && (
        <MelodyTool
          key={`${editingIdea?.id ?? "new-melody"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "melody" ? editingIdea : undefined}
          project={editorProject}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateEditorProject}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "drums" && (
        <DrumTool
          key={`${editingIdea?.id ?? "new-drums"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "drums" ? editingIdea : undefined}
          project={editorProject}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateEditorProject}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "bass" && (
        <BassTool
          key={`${editingIdea?.id ?? "new-bass"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "bass" ? editingIdea : undefined}
          project={editorProject}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateEditorProject}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "riff" && (
        <RiffTool
          key={`${editingIdea?.id ?? "new-riff"}-${draftSectionId ?? "default"}`}
          idea={editingIdea?.type === "riff" ? editingIdea : undefined}
          project={editorProject}
          section={draftSection}
          sectionIndex={draftSectionIndex}
          updateProject={updateEditorProject}
          back={backFromMusicTool}
          save={saveIdea}
          go={navigate}
          metronomeEnabled={toolMetronomeEnabled}
          toggleMetronome={() => setToolMetronomeEnabled((enabled) => !enabled)}
        />
      )}
      {screen === "metronome" && (
        <Metronome
          project={editorProject}
          updateProject={updateEditorProject}
          back={backFromMusicTool}
          go={navigate}
        />
      )}
      {screen === "settings" && (
        <Settings
          projects={projects}
          theme={theme}
          setTheme={setTheme}
          language={language}
          setLanguage={changeLanguage}
          compact={compact}
          setCompact={changeCompact}
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
            else createStandalone(action);
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
      {pendingHarmony && <div className="modal-layer" role="presentation"><section className="modal harmony-decision" role="dialog" aria-modal="true" aria-labelledby="harmony-decision-title">
        <h2 id="harmony-decision-title">These chords change the section</h2>
        <p>The saved bass and lead still follow the previous harmony. Choose what to hear before saving.</p>
        <button className="primary-button wide" onClick={()=>resolveHarmony("adapt")}>Adapt bass and lead, then save</button>
        <button className="secondary-button wide" onClick={()=>resolveHarmony("keep")}>Keep other parts, save chords</button>
        <button className="export-button wide" data-dialog-dismiss onClick={()=>resolveHarmony("revert")}>Return to editing</button>
      </section></div>}
      {projectToDelete && (
        <ConfirmProjectDelete
          project={projectToDelete}
          close={() => setProjectToDelete(null)}
          confirm={confirmDeleteProject}
        />
      )}
      {projectToShare && (
        <ShareProjectModal
          project={projectToShare}
          close={() => setProjectToShare(null)}
          sync={cloud.sync}
          left={() => {
            setProjects((items) => items.filter((project) => project.id !== projectToShare.id));
            setProjectToShare(null);
            setScreen("projects");
            notify(`Left ${projectToShare.name}`);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
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
  launchSketch: (project:Project) => void;
}) {
  const [startMode, setStartMode] = useState<"quick" | null>(null);
  const [presetId, setPresetId] = useState<SketchPreset["id"]>("neo-soul");
  const preset =
    SKETCH_PRESETS.find((candidate) => candidate.id === presetId) ??
    SKETCH_PRESETS[0];
  const [sketchRoot,setSketchRoot]=useState<Root>(preset.root);
  const [sketchMode,setSketchMode]=useState<Mode>(canonicalMode(preset.mode) as Mode);
  const [sketchBpm,setSketchBpm]=useState(String(preset.bpm));
  const [meterTop,setMeterTop]=useState(preset.meter.split("/")[0]);
  const [meterBottom,setMeterBottom]=useState(Number(preset.meter.split("/")[1]));
  const [includeMelody,setIncludeMelody]=useState(true);
  const [includePattern,setIncludePattern]=useState(preset.id==="prog"||preset.id==="heavy");
  const [extendedForm,setExtendedForm]=useState(false);
  const [sketchIntensity,setSketchIntensity]=useState<SketchOptions["intensity"]>("steady");
  const [musicalDirection,setMusicalDirection]=useState<MusicalDirection>("hopeful");
  const [draftChoices,setDraftChoices]=useState<{settings:string;projects:Project[]}|null>(null);
  const [previewIndex,setPreviewIndex]=useState(0);
  const [previewSectionId,setPreviewSectionId]=useState<string|null>(null);
  const choosePreset=(candidate:SketchPreset)=>{
    setMusicalDirection(candidate.id==="heavy"?"tense":candidate.id==="rock"||candidate.id==="funk"?"driving":candidate.id==="emotive"?"mellow":"hopeful");
    setPresetId(candidate.id);setSketchRoot(candidate.root);setSketchMode(canonicalMode(candidate.mode) as Mode);setSketchBpm(String(candidate.bpm));
    setMeterTop(candidate.meter.split("/")[0]);setMeterBottom(Number(candidate.meter.split("/")[1]));
    setIncludeMelody(true);setIncludePattern(candidate.id==="prog"||candidate.id==="heavy");setExtendedForm(false);
    setSketchIntensity(candidate.id==="emotive"?"mellow":candidate.id==="heavy"?"hard":"steady");
  };
  const randomizeSketchSettings=()=>{
    const random=seededRandom(freshSeed());
    const pick=<T,>(values:readonly T[])=>values[Math.floor(random()*values.length)];
    const relatedModes:Record<SketchStyle,Mode[]>={
      emotive:["aeolian","dorian","melodic minor"],rock:["ionian","mixolydian","dorian"],
      "neo-soul":["dorian","aeolian","melodic minor"],funk:["mixolydian","dorian","ionian"],
      prog:["dorian","lydian","aeolian","mixolydian"],heavy:["phrygian","aeolian","harmonic minor"],
    };
    const emotionalModes:Record<MusicalDirection,Mode[]>={mellow:["aeolian","dorian","melodic minor"],hopeful:["ionian","lydian","mixolydian"],driving:["dorian","mixolydian","aeolian"],tense:["phrygian","harmonic minor","aeolian"]};
    const compatible=relatedModes[preset.id].filter(mode=>emotionalModes[musicalDirection].includes(mode));
    const root=pick(ROOTS),mode=pick(compatible.length?compatible:emotionalModes[musicalDirection]);
    const bpm=clampBpm(preset.bpm-14+Math.floor(random()*29));
    setSketchRoot(root);setSketchMode(mode);setSketchBpm(String(bpm));
    const nextOptions={...sketchOptions,root,mode,bpm};
    selectDrafts(nextOptions,JSON.stringify([preset.id,nextOptions]),freshSeed());
  };
  const parsedSketchBpm=clampBpm(Number.parseInt(sketchBpm,10)||preset.bpm);
  const parsedMeterTop=Math.max(1,Math.min(16,Number.parseInt(meterTop,10)||Number(preset.meter.split("/")[0])||4));
  const sketchOptions:SketchOptions={root:sketchRoot,mode:sketchMode,bpm:parsedSketchBpm,meter:`${parsedMeterTop}/${meterBottom===8?8:4}`,includeMelody,includePattern,extendedForm,intensity:sketchIntensity,direction:musicalDirection};
  const settings=JSON.stringify([preset.id,sketchOptions]);
  const choices=draftChoices?.settings===settings?draftChoices.projects:null;
  const selectedDraft=choices?.[previewIndex];
  const selectDrafts=(options:SketchOptions,draftSettings:string,seed:number)=>{
    const candidates=Array.from({length:4},(_,index)=>buildPlayableSketch(preset,options,seed+index*7919));
    const best=chooseSketch(candidates);
    const identity=(project:Project,type:"chords"|"drums")=>project.sections[0]?.ideas.find(idea=>idea.type===type)?.name.split(" · ")[1];
    const ranked=candidates.filter(candidate=>candidate!==best).sort((a,b)=>scoreSketch(b)-scoreSketch(a));
    const differentBoth=(candidate:Project)=>identity(candidate,"chords")!==identity(best,"chords") && identity(candidate,"drums")!==identity(best,"drums");
    let different=ranked.filter(differentBoth);
    for(let index=4;!different.length&&index<12;index++){
      const candidate=buildPlayableSketch(preset,options,seed+index*7919);
      if(differentBoth(candidate))different=[candidate];
    }
    const alternative=different.sort((a,b)=>scoreSketch(b)-scoreSketch(a))[0]
      ?? ranked.find(candidate=>identity(candidate,"chords")!==identity(best,"chords"))
      ?? ranked[0];
    setDraftChoices({settings:draftSettings,projects:[best,alternative]});
    setPreviewIndex(0);setPreviewSectionId(null);
  };
  const generateChoices=()=>selectDrafts(sketchOptions,settings,freshSeed());
  return (
    <>
      <Topbar
        title="Your studio"
        subtitle="Capture a spark. Shape a song."
        onCreate={create}
      />
      <section className="spark-studio studio-launchpad">
        <div className="studio-launch-grid" aria-label="Ways to start">
          <button className="studio-launch-card launch-sketch" aria-haspopup="dialog" onClick={() => setStartMode("quick")}>
            <span className="launch-kicker">Easy mode</span><b>Build a song sketch</b><small>Choose a feel. Hear chords, drums, bass and melody working together.</small>
            <span className="launch-track-stack" aria-hidden="true"><i>Chords <em /></i><i>Drums <em /></i><i>Bass <em /></i><i>Melody <em /></i></span>
            <span className="launch-action">Create a sketch</span>
          </button>
        </div>
        <div className="studio-utility-actions">
          <button onClick={create}>
            <span aria-hidden="true">＋</span><b>Empty project</b><small>Shape the song manually from a blank section.</small>
          </button>
          <button onClick={record}>
            <span aria-hidden="true"><RecordIcon /></span><b>Record idea</b><small>Capture audio before the moment disappears.</small>
          </button>
        </div>
        {startMode === "quick" && <div className="modal-layer easy-mode-layer" onMouseDown={event=>{if(event.target===event.currentTarget)setStartMode(null);}}>
          <div className="modal easy-mode-modal" role="dialog" aria-modal="true" aria-labelledby="easy-mode-title">
          <button className="modal-close" aria-label="Close Easy Mode" onClick={()=>setStartMode(null)}>×</button>
          <div className="quick-sketch-heading"><div><p className="eyebrow">Easy mode</p><h2 id="easy-mode-title">Choose the song&apos;s direction</h2></div><span>Every part follows one shared musical plan.</span></div>
          <div className="preset-grid" role="radiogroup" aria-label="Sketch direction">
            {SKETCH_PRESETS.map((candidate) => (
            <button
              key={candidate.id}
              className={candidate.id === preset.id ? "active" : ""}
              role="radio"
              aria-checked={candidate.id === preset.id}
              onClick={() => choosePreset(candidate)}
            >
              <b>{candidate.accent}</b>
              <span>{candidate.label}</span>
              <small>{candidate.copy}</small>
            </button>
            ))}
          </div>
          <fieldset className="musical-directions"><legend>Emotional direction</legend><div>{(Object.keys(MUSICAL_DIRECTIONS) as MusicalDirection[]).map(direction=><button key={direction} type="button" aria-pressed={musicalDirection===direction} onClick={()=>{setMusicalDirection(direction);setSketchMode(MUSICAL_DIRECTIONS[direction].mode);}}>{MUSICAL_DIRECTIONS[direction].label}</button>)}</div><p>{MUSICAL_DIRECTIONS[musicalDirection].description}</p><small>Choosing a direction suggests a scale. You can change it below.</small></fieldset>
          <fieldset className="sketch-intensity"><legend>Intensity</legend><div>{(["mellow","steady","hard"] as const).map(level=><button key={level} type="button" aria-pressed={sketchIntensity===level} onClick={()=>{setSketchIntensity(level);if(level==="hard")setIncludePattern(true);}}>{level}</button>)}</div><small>{sketchIntensity==="hard"?"Driven guitar, heavier drums and an active bass line":sketchIntensity==="mellow"?"Acoustic chords, light drums and spacious phrases":"A balanced groove with room for contrast"}</small></fieldset>
          <details className="sketch-customize">
            <summary>Customize key, tempo and parts</summary>
          <div className="sketch-options" aria-label="Easy mode settings">
            <label><span>Key</span><select aria-label="Sketch key" value={sketchRoot} onChange={event=>setSketchRoot(event.target.value as Root)}>{ROOTS.map(root=><option key={root}>{root}</option>)}</select></label>
            <label><span>Scale</span><select aria-label="Sketch scale" value={sketchMode} onChange={event=>setSketchMode(event.target.value as Mode)}>{MODES.map(mode=><option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}</select></label>
            <label><span>Tempo</span><div className="sketch-tempo"><input aria-label="Sketch tempo" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" value={sketchBpm} onChange={event=>setSketchBpm(event.target.value.replace(/\D/g,"").slice(0,3))} onBlur={()=>setSketchBpm(String(parsedSketchBpm))}/><small>BPM</small></div></label>
            <label><span>Time signature</span><div className="sketch-meter"><input aria-label="Time signature beats" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" value={meterTop} onChange={event=>setMeterTop(event.target.value.replace(/\D/g,"").slice(0,2))} onBlur={()=>setMeterTop(String(parsedMeterTop))}/><b>/</b><select aria-label="Time signature subdivision" value={meterBottom} onChange={event=>setMeterBottom(Number(event.target.value))}><option value="4">4</option><option value="8">8</option></select></div></label>
          </div>
          <button className="randomize-sketch" onClick={randomizeSketchSettings}>↻ Surprise me within this feel</button>
          <div className="sketch-toggles" aria-label="Sketch arrangement options">
            <label><input type="checkbox" checked={includeMelody} onChange={event=>setIncludeMelody(event.target.checked)}/><span><b>Melody</b><small>Add a lead motif</small></span></label>
            <label><input type="checkbox" checked={includePattern} onChange={event=>setIncludePattern(event.target.checked)}/><span><b>Synth pattern</b><small>Add a rhythmic counter-layer</small></span></label>
            <label><input type="checkbox" checked={extendedForm} onChange={event=>setExtendedForm(event.target.checked)}/><span><b>Extended form</b><small>Build five contrasting sections</small></span></label>
          </div>
          </details>
          <div className="sketch-launcher">
            <div className="sketch-spec">
              <span><small>Key</small>{formatProjectKey(sketchOptions.root, sketchOptions.mode)}</span>
              <span><small>Tempo</small>{sketchOptions.bpm} BPM</span>
              <span><small>Time signature</small>{sketchOptions.meter}</span>
              <span><small>Intensity</small>{sketchIntensity}</span>
            </div>
            <button className="primary-button" onClick={generateChoices}>
              Hear two drafts <span>＋</span>
            </button>
          </div>
          {choices&&<section className="sketch-choices" aria-label="Compare song drafts">
            <p>Choose a draft to play. Both follow your key, tempo and time signature. Save only the one you want to edit.</p>
            <div className="sketch-choice-grid" role="radiogroup" aria-label="Song draft">
              {choices.map((candidate,index)=><button key={candidate.id} role="radio" aria-checked={previewIndex===index} className={previewIndex===index?"active":""} onClick={()=>{setPreviewIndex(index);setPreviewSectionId(null);}}>
                <b>Draft {index+1}</b><span data-no-translate>{candidate.sections.map(section=>section.name).join(" → ")}</span>
                <small>{candidate.sections[0]?.ideas.find(idea=>idea.type==="chords")?.data?.map(value=>value.split("|")[0]).join(" · ")}</small>
                <small>{candidate.sections[0]?.ideas.find(idea=>idea.type==="chords")?.name.split(" · ")[1]} · {candidate.sections[0]?.ideas.find(idea=>idea.type==="drums")?.name.split(" · ")[1]}</small>
                <em>{previewIndex===index?"Selected for playback":"Select to hear"}</em>
              </button>)}
            </div>
            <div className="sketch-choice-actions">
              <button className="secondary-button" onClick={generateChoices}>Try two more</button>
              <button className="primary-button" onClick={()=>selectedDraft&&launchSketch(selectedDraft)}>Keep this draft</button>
            </div>
          </section>}
          {selectedDraft&&<SharedSectionPlayer key={selectedDraft.id} project={selectedDraft} previews={{}} activeSectionId={previewSectionId} activeTool="project" go={go} chooseSection={setPreviewSectionId} updateProject={()=>{}} previewOnly />}
          </div>
        </div>}
      </section>
      <section className="recent-projects" aria-label="Recent projects">
        <SectionTitle
          eyebrow="Pick up where you left off"
          title="Recent projects"
          action="View all"
          onAction={() => go("projects")}
        />
        {projects.length ? <div className="project-grid">
          {sortProjects(projects).slice(0, 3).map((p, i) => (
            <button
              className={`project-card ${COLORS[i % COLORS.length]}`}
              key={p.id}
              onClick={() => openProject(p.id)}
            >
              <Wave tone={COLORS[i % COLORS.length]} />
              <span>{p.sections.length} sections · Tempo {p.bpm} BPM</span>
              <h4>{p.name}</h4>
              <p>Key {p.key} · Time {p.meter}</p>
            </button>
          ))}
        </div> : <p className="recent-projects-empty">Your saved projects will appear here.</p>}
      </section>
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
    <button className={`tool-choice ${tone}`} onClick={onClick}>
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
  const [sortOrder, setSortOrder] = useState<"recent" | "name">("recent");
  return (
    <>
      <Topbar title="Projects" subtitle="Your songbook" onCreate={create} />
      <div className="projects-toolbar">
        <p>{projects.length} works in progress</p>
        <button onClick={() => setSortOrder(order => order === "recent" ? "name" : "recent")} aria-label={sortOrder === "recent" ? "Sort projects by name" : "Sort projects by recent edits"}>{sortOrder === "recent" ? "Recently edited ↓" : "Name A–Z ↓"}</button>
      </div>
      <div className="projects-list">
        {sortProjects(projects, sortOrder).map((p, index) => (
          <article className="project-row" key={p.id}>
            <button className="project-open" onClick={() => openProject(p.id)}>
              <span className={`project-avatar ${COLORS[index % COLORS.length]}`}>
                <Wave tone={COLORS[index % COLORS.length]} bars={5} />
              </span>
              <div>
                <h3>{p.name}</h3>
                <p>
                  {p.sections.length} sections · Key {p.key} · Tempo {p.bpm} BPM · Time {p.meter}
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
function ShareIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg>;
}
function GearIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.38.72.68 1 .3.27.7.41 1.1.4H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>;
}
function RecordIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>;
}
const SECTION_ASSETS = [
  ["drums", "Drums", "▦"], ["bass", "Bass", "♭"], ["chords", "Chords", "♯"],
  ["melody", "Melody", "♥"], ["riff", "Pattern", "⇶"],
] as const;
const partPreviewLabel=(idea:Idea)=>{
  if(idea.type==="chords")return idea.data?.slice(0,4).map(value=>value.split("|")[0]).join(" · ")||"Saved harmony";
  if(idea.type==="drums")return idea.voice&&idea.voice in DRUM_KIT_LABELS?DRUM_KIT_LABELS[idea.voice as DrumKit]:"Saved groove";
  if(idea.type==="bass")return idea.voice||"Follows the harmony";
  if(idea.type==="melody")return idea.voice||"Saved melody";
  if(idea.type==="riff")return idea.voice||"Saved pattern";
  if(idea.type==="audio")return "Recorded take";
  return "Saved part";
};
type UndoRemoval =
  | { kind:"section"; label:string; section:SongSection; index:number }
  | { kind:"idea"; label:string; idea:Idea; sectionId:string; index:number };

function ProjectView({
  project,
  selectedSectionId,
  setSelectedSectionId,
  update,
  back,
  record,
  openSectionTool,
  editIdea,
  deleteProject,
  shareProject,
  clearAssetDraft,
}: {
  project: Project;
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;
  update: (fn: (p: Project) => Project) => void;
  back: () => void;
  record: () => void;
  openSectionTool: (
    sectionId: string,
    tool: "chords" | "melody" | "drums" | "bass" | "riff",
  ) => void;
  editIdea: (sectionId: string, idea: Idea) => void;
  deleteProject: () => void;
  shareProject: () => void;
  clearAssetDraft: (sectionId: string, idea: Idea, removeDraft?: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [sectionPanel, setSectionPanel] = useState<"parts" | "mix" | "notes">("parts");
  const [ideaSection, setIdeaSection] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionDirection,setSectionDirection]=useState<GuidedSectionDirection>("continue");
  const [returnSourceId,setReturnSourceId]=useState<string|null>(null);
  const [sectionEnergy,setNewSectionEnergy]=useState<SectionEnergy>("balanced");
  const [renamingSectionId,setRenamingSectionId]=useState<string|null>(null);
  const [sectionRename,setSectionRename]=useState("");
  const [renamingProject,setRenamingProject]=useState(false);
  const [projectRename,setProjectRename]=useState(project.name);
  const [undoRemoval,setUndoRemoval]=useState<UndoRemoval|null>(null);
  const [creativeSectionId,setCreativeSectionId]=useState<string|null>(null);
  const dragSection=useRef<string|null>(null);
  const dragTarget=useRef<string|null>(null);
  const [dropTarget,setDropTarget]=useState<string|null>(null);
  const [orderMessage,setOrderMessage]=useState("");
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(
    null,
  );
  const [playingIdeaId, setPlayingIdeaId] = useState<string | null>(null);
  const arrangementTimer = useRef<number | null>(null);
  const playbackTimer = useRef<number | null>(null);
  const sectionTimers = useRef<number[]>([]);
  const ideaTimer = useRef<number | null>(null);
  const ideaAudio = useRef<HTMLAudioElement | null>(null);
  const engine = useAudioEngine();
  useEffect(()=>{
    const receive=(event:Event)=>{
      const data=(event as CustomEvent<{projectId:string;sectionId:string;seconds:number}|null>).detail;
      if(!data){setActiveSectionIndex(null);return;}
      if(data.projectId!==project.id)return;
      setActiveSectionIndex(project.sections.findIndex(s=>s.id===data.sectionId));
    };
    window.addEventListener("inspitivity-song-position",receive);
    return()=>window.removeEventListener("inspitivity-song-position",receive);
  },[project.id,project.sections]);
  useEffect(() => {
    if (!project.sections.some((section) => section.id === selectedSectionId))
      setSelectedSectionId(project.sections[0]?.id ?? null);
  }, [project.sections, selectedSectionId]);
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

    setActiveSectionIndex(null);

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
    if (selectedSectionId === sectionId)
      setSelectedSectionId(project.sections[index + 1]?.id ?? project.sections[index - 1]?.id ?? null);
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
  const setSectionMeter = (sectionId: string, barIndex: number, meter: string) =>
    update((p) => ({
      ...p,
      sections: p.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const map = sectionMeterMap(section, p.meter);
        map[barIndex] = meter;
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
    update((p) => ({ ...p, sections:p.sections.map((section) => section.id === sectionId ? { ...section, mix:automaticSectionMix(section,p) } : section) }));
  };
  const setSectionRepeats = (sectionId: string, repeats: number) => {
    stopArrangement();
    update((p) => ({ ...p, sections:p.sections.map((section) => section.id === sectionId ? { ...section, repeats } : section) }));
  };
  const setSectionEnergy = (sectionId: string, energy: SectionEnergy) => {
    stopArrangement();
    update((p) => ({ ...p, sections:p.sections.map((section) => {
      if(section.id!==sectionId||section.energy===energy)return section;
      const next={...section,energy};
      const previousAuto=automaticSectionMix(section,p),nextAuto=automaticSectionMix(next,p);
      const current=sectionMix(section);
      return {...next,mix:Object.fromEntries(LAYER_LABELS.map(([layer])=>[
        layer,{...current[layer],volume:Math.max(0,Math.min(1,Number((current[layer].volume+nextAuto[layer].volume-previousAuto[layer].volume).toFixed(2))))},
      ])) as Record<SongLayer,TrackMix>};
    }) }));
  };
  const selectedReturnSource=project.sections.find(section=>section.id===returnSourceId)??project.sections.find(section=>section.id===selectedSectionId)??preferredReturnSource(project);
  const finishAddingSection=()=>{setSectionName("");setSectionDirection("continue");setReturnSourceId(null);setNewSectionEnergy("balanced");setAdding(false);};
  const addEmptySection=()=>{
    const name=sectionName.trim();if(!name)return;
    const id=uid();
    update((p)=>({...p,sections:[...p.sections,{id,name,bars:8,color:COLORS[p.sections.length%COLORS.length],ideas:[],meterMap:Array.from({length:8},()=>p.meter),energy:sectionEnergy}]}));
    setSelectedSectionId(id);setSectionPanel("parts");
    finishAddingSection();
  };
  const generateCompleteSection=()=>{
    const name=sectionName.trim();if(!name)return;
    stopArrangement();stopIdea();
    const id=uid();
    update((p)=>{const generated=buildGuidedSection(p,name,sectionEnergy,sectionDirection,selectedReturnSource?.id);return {...p,sections:[...p.sections,{...generated,id}]};});
    setSelectedSectionId(id);setSectionPanel("parts");
    announceGenerated("Complete section");
    finishAddingSection();
  };
  const duplicateSection = (sectionId: string, variation: boolean) => {
    if(variation){setCreativeSectionId(sectionId);return;}
    const source=project.sections.find(section=>section.id===sectionId);if(!source)return;
    const copy:SongSection={...source,id:uid(),name:`${source.name} copy`,repeats:1,ideas:source.ideas.map(idea=>({...idea,id:uid(),data:idea.data?[...idea.data]:undefined}))};
    update(p=>{const sections=[...p.sections],index=sections.findIndex(s=>s.id===sectionId);if(index<0)return p;sections.splice(index+1,0,copy);return {...p,sections};});
  };
  const createSectionReturn=(sectionId:string)=>update(p=>{
    const source=p.sections.find(section=>section.id===sectionId);
    if(!source)return p;
    const returned:SongSection={...source,id:uid(),name:`${source.name} return`,repeats:1,meterMap:source.meterMap?[...source.meterMap]:undefined,mix:source.mix?JSON.parse(JSON.stringify(source.mix)):undefined,ideas:source.ideas.map(idea=>({...idea,id:uid(),name:`${idea.name} return`,data:idea.data?[...idea.data]:undefined}))};
    return {...p,sections:[...p.sections,returned]};
  });
  const shapeEnergyArc=()=>update(p=>({...p,sections:p.sections.map((section,index)=>{
    const energy:SectionEnergy=index===0?"mellow":index===p.sections.length-1?"powerful":"balanced";
    const next={...section,energy};return {...next,mix:automaticSectionMix(next,p)};
  })}));
  const applyArrangementInsight=(insight:ArrangementInsight)=>{
    if(insight.action==="add_section")setAdding(true);
    if(insight.action==="create_return"&&insight.sectionId)createSectionReturn(insight.sectionId);
    if(insight.action==="shape_energy")shapeEnergyArc();
    if(insight.action==="add_foundation"&&insight.sectionId&&insight.tool)openSectionTool(insight.sectionId,insight.tool);
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
    if (!(await engine.unlock(idea.type==="drums"?(idea.voice as DrumKit)||"current":undefined,idea.voice==="acoustic guitar",idea.voice==="distorted guitar"))) {window.dispatchEvent(new CustomEvent("inspitivity-notice",{detail:"Instrument samples or audio unavailable. Try Play again."}));return;}
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
      const saved = (idea.data?.length ? idea.data : idea.detail.split(" · ")).map(decodeRhythmicChord);
      for (const note of chordNoteEvents(saved))
        engine.tone(note.pitch,note.start*beat,note.duration*beat,.045*note.velocity,(idea.voice as SynthVoice)||"warm pad");
      finishAt(saved.reduce((sum,chord)=>sum+chord.beats,0)*beat*1000);
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
        engine.tone(event.pitch, event.start * beat, event.duration * beat, event.accent ? .065 : .05, (idea.voice as BassVoice) || "deep bass"),
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
      idea.type === "riff"
    )
      editIdea(sectionId, idea);
    else void playIdea(idea);
  };
  const addSectionNote = (sectionId: string) => {
    setEditingNoteId(null);
    setNote("");
    setIdeaSection(sectionId);
  };
  const arrangementPlan = useMemo(()=>buildSongPlan(project),[project]);
  const arrangementCheck=useMemo(()=>analyzeArrangement(project),[project]);
  const shortestSection=Math.max(1,Math.min(...project.sections.map(s=>timelineDuration(s,project.meter))));
  const commitSectionMove=(source:string,target:string)=>{
    stopArrangement();stopIdea();
    update(p=>({...p,sections:reorderSection(p.sections,source,target)}));
    setOrderMessage(`Moved ${project.sections.find(s=>s.id===source)?.name ?? "section"} to position ${project.sections.findIndex(s=>s.id===target)+1}`);
  };
  return (
    <>
      <Topbar
        title={project.name}
        subtitle={`Key ${project.key} · Tempo ${project.bpm} BPM · Time ${project.meter}`}
        onBack={back}
      />
      <ProjectContext project={project} update={update}/>
      {undoRemoval&&<div className="undo-removal" role="status"><span>Removed {undoRemoval.label}</span><button onClick={restoreRemoval}>Undo</button><button aria-label="Dismiss undo" onClick={()=>setUndoRemoval(null)}>×</button></div>}
      {creativeSectionId&&project.sections.find(s=>s.id===creativeSectionId)&&<SectionCreativeDialog newId={uid} generateSeed={freshSeed} renderPreview={(preview,sectionId,autoStart,key)=><SharedSectionPlayer key={key} project={preview} previews={{}} activeSectionId={sectionId} activeTool="project" go={()=>{}} chooseSection={()=>{}} updateProject={()=>{}} previewOnly autoStart={autoStart}/>} project={project} source={project.sections.find(s=>s.id===creativeSectionId)!} close={()=>setCreativeSectionId(null)} save={(section,asNew)=>{stopArrangement();stopIdea();update(p=>{const index=p.sections.findIndex(s=>s.id===creativeSectionId);if(index<0)return p;const sections=[...p.sections];if(asNew)sections.splice(index+1,0,section);else sections[index]=section;return {...p,sections};});setSelectedSectionId(section.id);setCreativeSectionId(null);}}/>}
      <SectionTitle
        eyebrow=""
        title="Arrangement"
      />
      <div className="section-timeline" role="tablist" aria-label="Song sections">
        {project.sections.map((section,index)=><button
          key={section.id}
          role="tab"
          data-section-id={section.id}
          data-drop-target={dropTarget===section.id}
          style={{flex:`${timelineDuration(section,project.meter)} 0 ${120*timelineDuration(section,project.meter)/shortestSection}px`,maxWidth:"none",minWidth:120}}
          title="Select section. Drag the grip to reorder, or use Alt + Left/Right."
          onKeyDown={event=>{
            if(!event.altKey || !["ArrowLeft","ArrowRight"].includes(event.key))return;
            event.preventDefault();
            const target=project.sections[index+(event.key==="ArrowLeft"?-1:1)];
            if(target)commitSectionMove(section.id,target.id);
          }}
          aria-selected={selectedSectionId===section.id}
          className={`${section.color} ${selectedSectionId===section.id?"selected":""} ${activeSectionIndex===index?"playing":""}`}
          onClick={()=>{setSelectedSectionId(section.id);setSectionPanel("parts");}}
        >
          <span className="section-drag-grip" title={`Drag ${section.name} to reorder`}
            onClick={event=>event.stopPropagation()}
            onPointerDown={event=>{
              if(event.button!==0)return;
              event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
              dragSection.current=section.id;dragTarget.current=null;
            }}
            onPointerMove={event=>{
              if(!dragSection.current)return;
              const strip=event.currentTarget.closest('.section-timeline');
              const bounds=strip?.getBoundingClientRect();
              if(strip&&bounds){if(event.clientX>bounds.right-40)strip.scrollLeft+=16;else if(event.clientX<bounds.left+40)strip.scrollLeft-=16;}
              const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-section-id]')?.getAttribute('data-section-id')??null;
              dragTarget.current=target;setDropTarget(target);
            }}
            onPointerUp={event=>{
              event.stopPropagation();
              if(dragSection.current&&dragTarget.current&&dragSection.current!==dragTarget.current)commitSectionMove(dragSection.current,dragTarget.current);
              dragSection.current=null;dragTarget.current=null;setDropTarget(null);
            }}
            onPointerCancel={()=>{dragSection.current=null;dragTarget.current=null;setDropTarget(null);}}
          >⠿ {String(index+1).padStart(2,"0")}</span>
          <b data-no-translate>{section.name}</b>
          <small>{section.bars} bars{(section.repeats??1)>1?` · ×${section.repeats}`:""}</small>
          <i aria-label={`${section.ideas.filter(idea=>idea.type!=="text").length} parts`}>
            {SECTION_ASSETS.map(([type])=><em key={type} className={section.ideas.some(idea=>idea.type===type)?"filled":""}/>) }
          </i>
        </button>)}
        <button className="add-section-tile" onClick={()=>setAdding(true)}><span>＋</span><b>Add section</b></button>
      </div>
      <p className="sr-only" role="status">{orderMessage}</p>
      <div className="song-lanes" role="grid" aria-label="Song tracks across sections">
        <div className="song-lane song-lane-heading" role="row"><b role="columnheader">Tracks</b>{project.sections.map(section=><span key={section.id} role="columnheader" data-no-translate>{section.name}</span>)}</div>
        {SECTION_ASSETS.filter(([type])=>["drums","bass","chords","melody","riff"].includes(type)).map(([type,label])=><div className="song-lane" role="row" key={type}>
          <b role="rowheader">{label}</b>
          {project.sections.map(section=>{const idea=section.ideas.find(item=>item.type===type);return <button key={section.id} role="gridcell" className={idea?"has-part":""} aria-label={`${idea?"Edit":"Create"} ${label} in ${section.name}`} onClick={()=>{setSelectedSectionId(section.id);setSectionPanel("parts");idea?openIdea(section.id,idea):openSectionTool(section.id,type);}}>{idea?<span aria-hidden="true">▰</span>:<span aria-hidden="true">＋</span>}</button>;})}
        </div>)}
      </div>
      <div className="arrangement-list arrangement-timeline" aria-label="Song sections, top to bottom">
        {project.sections.filter(section=>section.id===selectedSectionId).map((section) => {
          const index=project.sections.findIndex(item=>item.id===section.id);
          return (
          <article key={section.id} className={`section-card asset-section ${activeSectionIndex === index ? "playing" : ""}`}>
            <header className="asset-section-heading">
              <div className="section-title-editor"><span className="section-position">SECTION {String(index+1).padStart(2,"0")}</span>{renamingSectionId===section.id?<form onSubmit={event=>{event.preventDefault();commitRename(section.id);}}><input autoFocus aria-label={`Rename ${section.name}`} value={sectionRename} onChange={event=>setSectionRename(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")setRenamingSectionId(null);}}/><button type="submit">Save</button></form>:<div><h3 data-no-translate>{section.name}</h3><button className="rename-section" aria-label={`Rename ${section.name}`} onClick={()=>beginRename(section)}>✎</button></div>}</div>
              <span className="section-length-summary">{section.bars} bars · {section.energy??sectionFeel(project,section).energy}</span>
            </header>
            <div className="section-meta-chips" aria-label={`${section.name} settings`}>
              <label className="section-length"><span>Bars</span>
                <select aria-label={`${section.name} length`} value={section.bars} onChange={e=>{stopArrangement();setSectionBars(section.id,Number(e.target.value));}}>
                  {[...new Set([section.bars,1,2,4,8,12,16,24,32])].sort((a,b)=>a-b).map(bars=><option key={bars} value={bars}>{bars} bars</option>)}
                </select>
              </label>
              <label className="section-repeat"><span>Repeat</span><select aria-label={`${section.name} repeats`} value={section.repeats??1} onChange={(event)=>setSectionRepeats(section.id,Number(event.target.value))}>{[1,2,3,4].map(value=><option key={value} value={value}>×{value}</option>)}</select></label>
              <label className="section-energy"><span>Feel</span><select aria-label={`${section.name} feel`} value={section.energy??sectionFeel(project,section).energy} onChange={(event)=>setSectionEnergy(section.id,event.target.value as SectionEnergy)}>{SECTION_FEELS.map(value=><option key={value}>{value}</option>)}</select></label>
              <details className="section-meter-settings"><summary><span>Meter</span><b>{[...new Set(sectionMeterMap(section,project.meter))].join(" / ")}</b></summary>
                <div className="meter-map">{sectionMeterMap(section,project.meter).map((meter,barIndex)=><label key={barIndex}><span>Bar {barIndex+1}</span><select aria-label={`Time signature for bar ${barIndex+1}`} value={meter} onChange={event=>setSectionMeter(section.id,barIndex,event.target.value)}>{[...new Set([meter,...COMMON_METERS])].map(option=><option key={option} value={option}>{option}</option>)}</select></label>)}</div>
              </details>
            </div>
            <button className="section-creative-launch" onClick={()=>{stopArrangement();stopIdea();window.dispatchEvent(new Event("inspitivity-solo-preview"));setCreativeSectionId(section.id);}}>Develop & vary <small>Keep parts · compare · build related sections</small></button>
            <div className="section-detail-tabs" role="tablist" aria-label={`${section.name} details`}>
              {(["parts","mix","notes"] as const).map(panel=><button key={panel} role="tab" aria-selected={sectionPanel===panel} onClick={()=>setSectionPanel(panel)}>{panel}</button>)}
            </div>
            {sectionPanel==="parts"&&<div className="section-assets">
              {([...SECTION_ASSETS,...(section.ideas.some(i=>i.type==="audio") ? [["audio","Recording","●"] as const] : [])]).map(([type,label,icon])=>{
                const assets=section.ideas.filter(i=>i.type===type),idea=assets[0];
                const playable=!!idea;
                return <div key={type} data-tool={type} className={`asset-tile ${idea ? "is-created" : "is-empty"}`}>
                  <button className="asset-open" aria-label={`${idea ? "Edit" : "Create"} ${label} in ${section.name}`} onClick={()=>idea ? openIdea(section.id,idea) : type!=="audio" && openSectionTool(section.id,type)}>
                    <span aria-hidden="true">{icon}</span><span>{label}<small>{idea ? partPreviewLabel(idea) : `+ Add ${label.toLowerCase()}`}</small></span>
                  </button>
                  {idea&&<details className="part-actions"><summary aria-label={`${label} actions`}>•••</summary><div><button disabled={!playable} onClick={()=>void playIdea(idea)}>{playingIdeaId===idea.id?"Stop audition":"Audition saved part"}</button><button className="danger-action" aria-label={`Remove ${label} from ${section.name}`} onClick={()=>removeIdea(section.id,idea.id)}><TrashIcon /> Remove part</button></div></details>}
                  {assets.length>1 && <select className="asset-takes" aria-label={`${label} saved version in ${section.name}`} value={idea.id} onChange={e=>{
                    const chosen=assets.find(i=>i.id===e.target.value);if(!chosen)return;
                    stopArrangement();stopIdea();clearAssetDraft(section.id,idea);
                    update(p=>({...p,sections:p.sections.map(s=>s.id===section.id?{...s,ideas:[chosen,...s.ideas.filter(i=>i.id!==chosen.id)]}:s)}));
                  }}>{assets.map((asset,i)=><option key={asset.id} value={asset.id}>{i+1}. {asset.name}</option>)}</select>}
                </div>;
              })}
            </div>}
            {sectionPanel==="mix"&&<section className="section-mixer embedded-mixer" aria-label={`Mix ${section.name}`}>
              <header><div><b>Section mix</b><span>Peak-safe levels</span></div></header>
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
            </section>}
            {sectionPanel==="notes"&&<section className="section-notes" aria-label={`Notes for ${section.name}`}>
              <header>
                <div><b>Section notes</b><span>{section.ideas.filter(i=>i.type==="text").length ? `${section.ideas.filter(i=>i.type==="text").length} saved` : "Lyrics, production or arrangement"}</span></div>
                <button className="add-section-note" onClick={()=>addSectionNote(section.id)}>＋ Add note</button>
              </header>
              {section.ideas.filter(i=>i.type==="text").map(idea=><div className="existing-note" key={idea.id}><button data-no-translate aria-label={`Edit note in ${section.name}`} onClick={()=>openIdea(section.id,idea)}>{idea.detail}</button><button aria-label={`Remove ${idea.name}`} onClick={()=>removeIdea(section.id,idea.id)}><TrashIcon /></button></div>)}
            </section>}
            <footer className="section-order-controls">
              <button onClick={()=>move(index,-1)} disabled={index===0} aria-label={`Move ${section.name} up`}>↑</button>
              <button onClick={()=>move(index,1)} disabled={index===project.sections.length-1} aria-label={`Move ${section.name} down`}>↓</button>
              <details className="section-more-actions">
                <summary aria-label={`More actions for ${section.name}`}>•••</summary>
                <div>
                  <button onClick={()=>duplicateSection(section.id,false)} aria-label={`Duplicate ${section.name}`}>⧉ <span>Copy</span></button>
                  <button onClick={()=>{stopArrangement();stopIdea();window.dispatchEvent(new Event("inspitivity-solo-preview"));setCreativeSectionId(section.id);}} aria-label={`Develop and vary ${section.name}`}>⌁ <span>Develop & vary</span></button>
                  <button className="danger-action" onClick={()=>removeSection(section.id)} disabled={project.sections.length===1} aria-label={`Remove ${section.name}`}><TrashIcon /><span>Delete</span></button>
                </div>
              </details>
            </footer>
          </article>
        )})}
      </div>
      <details className={`arrangement-check ${arrangementCheck.ready?"is-ready":""}`}>
        <summary aria-label="Arrangement check"><span>Song check</span><b>{arrangementCheck.ready?"Ready":"Next moves"}</b></summary>
        {arrangementCheck.ready ? <p>Repetition, contrast and the core musical layers are covered.</p> : <div className="arrangement-insights">{arrangementCheck.insights.map(insight=><article key={insight.id}><div><b>{insight.title}</b><p>{insight.detail}</p></div><button onClick={()=>applyArrangementInsight(insight)}>{insight.action==="create_return"?"Create return":insight.action==="shape_energy"?"Shape energy":insight.action==="add_foundation"?`Add ${insight.tool}`:"Add section"}</button></article>)}</div>}
      </details>
      <details className="project-options">
        <summary>Project options <span aria-hidden="true">•••</span></summary>
        <div>
          <button onClick={()=>downloadMidi(project.name,exportSongMidi(project))} disabled={!arrangementPlan.events.length}>⇩ Export song as multitrack MIDI</button>
          <button onClick={()=>{setProjectRename(project.name);setRenamingProject(true);}}>✎ Rename project</button>
          <button onClick={record}><RecordIcon /> Record idea</button>
          <button onClick={shareProject}><ShareIcon /> Share project</button>
          <button className="danger-action" onClick={deleteProject}><TrashIcon /> Delete project</button>
        </div>
      </details>
      {renamingProject&&<div className="modal-layer"><form className="modal small" onSubmit={event=>{event.preventDefault();const name=projectRename.trim();if(name)update(p=>({...p,name}));setRenamingProject(false);}}><button type="button" className="modal-close" onClick={()=>setRenamingProject(false)}>×</button><p className="eyebrow">Project</p><h2>Rename project</h2><label className="field"><span>Project name</span><input autoFocus value={projectRename} onChange={event=>setProjectRename(event.target.value)}/></label><button className="primary-button wide" type="submit" disabled={!projectRename.trim()}>Save name</button></form></div>}
      {adding && (
        <div className="modal-layer">
          <div className="modal small">
            <button className="modal-close" onClick={() => setAdding(false)}>
              ×
            </button>
            <p className="eyebrow">New section</p>
            <h2>Build the next section</h2>
            <label className="field">
              <span>Section name</span>
              <input
                value={sectionName}
                onChange={(event) => setSectionName(event.target.value)}
                placeholder="Bridge, pre-chorus, outro…"
              />
            </label>
            <div className="guided-section-controls">
              <Select label="Relationship" value={sectionDirection} options={["continue","contrast","return"]} set={(value)=>setSectionDirection(value as GuidedSectionDirection)} />
              <Select label="Energy" value={sectionEnergy} options={[...SECTION_FEELS]} set={(value)=>setNewSectionEnergy(value as SectionEnergy)} />
            </div>
            {selectedReturnSource&&<label className="field"><span>{sectionDirection==="return"?"Return to":"Develop from"}</span><select aria-label="Source section" value={selectedReturnSource.id} onChange={event=>setReturnSourceId(event.target.value)}>{project.sections.map(section=><option key={section.id} value={section.id} data-no-translate>{section.name}</option>)}</select></label>}
            <p className="guided-section-copy">Generate creates harmony, melody, drums and bass together. Powerful or riff-led songs also receive a supporting pattern.</p>
            <button
              className="primary-button wide"
              disabled={!sectionName.trim()}
              onClick={generateCompleteSection}
            >
              Generate complete section
            </button>
            <button className="secondary-button wide" disabled={!sectionName.trim()} onClick={addEmptySection}>Add empty section</button>
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


function SharedSectionPlayer({ project, previews, activeSectionId, activeTool, go, chooseSection, updateProject, previewOnly=false, autoStart=false }: {
  project: Project;
  previews: Record<string, DraftPreview>;
  activeSectionId: string | null;
  activeTool: Screen;
  go: (screen:Screen)=>void;
  chooseSection: (id: string) => void;
  updateProject: (fn: (project: Project) => Project) => void;
  previewOnly?: boolean;
  autoStart?: boolean;
}) {
  const engine = useAudioEngine();
  const clickEngine=useAudioEngine();
  const clickTick=useRef<(()=>void)|null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused,setPaused]=useState(false);
  const [busy,setBusy]=useState(false);
  const pausedRef=useRef(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [scope,setScope]=useState<"section"|"song">("song");
  const [loop,setLoop]=useState(false);
  const [countIn,setCountIn]=useState(false);
  const [click,setClick]=useState(false);
  const [position,setPosition]=useState("Ready");
  const focusedLayer = (["drums","bass","chords","melody","riff"] as const).find(layer=>layer===activeTool) ?? null;
  const [soloFocusedPart,setSoloFocusedPart]=useState(Boolean(focusedLayer));
  useEffect(()=>setSoloFocusedPart(Boolean(focusedLayer)),[focusedLayer]);
  const effectiveScope=scope;
  const structureKey=project.sections.map(s=>`${s.id}:${s.bars}:${s.repeats??1}:${s.meterMap?.join(",")}`).join("/");
  const selectedSection = project.sections.find(s => s.id === activeSectionId) ?? project.sections[0];
  const playbackSelection=scope==="song"?`song${loop?":loop":""}`:`section:${selectedSection?.id ?? ""}${loop?":loop":""}`;
  const selectPlayback=(value:string)=>{
    stop();
    const repeating=value.endsWith(":loop");
    const destination=repeating?value.slice(0,-5):value;
    setLoop(repeating);
    if(destination==="song")setScope("song");
    else if(destination.startsWith("section:")){
      const sectionId=destination.slice(8);
      if(project.sections.some(section=>section.id===sectionId)){setScope("section");chooseSection(sectionId);}
    }
  };
  const mix = sectionMix(selectedSection);
  const previewProject=useMemo(()=>playbackProject(project,previews,activeSectionId,effectiveScope,activeTool),[project,previews,activeSectionId,effectiveScope,activeTool]);
  const plan = useMemo(() => buildSongPlan(previewProject), [previewProject]);
  const mixes=useMemo(()=>new Map(project.sections.map(section=>[section.id,sectionMix(section)])),[project.sections]);
  const latest = useRef({ plan, mixes,loop,click });
  useEffect(() => { latest.current = { plan, mixes,loop,click }; }, [plan, mixes,loop,click]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null), generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current=null; engine.stopAll();clickEngine.stopAll();clickTick.current=null; setPlaying(false); setProgress(0);
    pausedRef.current=false;setPaused(false);publishPlayhead(null);
    setPosition("Ready");window.dispatchEvent(new CustomEvent("inspitivity-song-position",{detail:null}));
  }, [engine,clickEngine]);
  const toggleClick=(enabled:boolean)=>{
    latest.current.click=enabled;setClick(enabled);
    if(!enabled)clickEngine.stopAll();
    clickTick.current?.();
  };
  useEffect(() => {
    window.addEventListener("inspitivity-solo-preview",stop);
    return () => { window.removeEventListener("inspitivity-solo-preview",stop); stop(); };
  }, [stop, project.id, selectedSection?.id,effectiveScope,project.bpm,project.meter,structureKey]);
  const start = async () => {
    if(pausedRef.current){
      setBusy(true);
      const token=generation.current;
      try {if(await engine.unlock() && token===generation.current){pausedRef.current=false;setPaused(false);setPlaying(true);}}
      catch {setMessage("Audio could not resume. Try Play again.");}
      finally {setBusy(false);}
      return;
    }
    stop();
    const token = generation.current;
    try {
      setBusy(true);
      if (!(await engine.unlock(drumBankRequirement(latest.current.plan.events),latest.current.plan.events.some(e=>e.voice==="acoustic guitar"),latest.current.plan.events.some(e=>e.voice==="distorted guitar"))) || token !== generation.current) {setMessage("Audio or instrument samples unavailable. Try Play again.");return;}
      if (!latest.current.plan.events.length) { setMessage("Add or generate a part to hear this section."); return; }
      window.dispatchEvent(new Event("inspitivity-context-play"));
      setMessage(""); setPlaying(true);
      const beatSeconds=60/project.bpm,countBeats=countIn?meterBeats(selectedSection?.meterMap?.[0]??project.meter):0;
      const countOrigin=engine.get().currentTime+.08;
      let cyclePlan=latest.current.plan, origin=countOrigin+countBeats*beatSeconds, index=0,clickIndex=0;
      let clickCursor=new QuarterClickScheduler(latest.current.click);
      const scheduleMetronome=()=>{
        const now=engine.get().currentTime;
        if(pausedRef.current){clickCursor.collect(false,now-origin,beatSeconds,cyclePlan.seconds);return;}
        for(const beat of clickCursor.collect(latest.current.click,now-origin,beatSeconds,cyclePlan.seconds)){
          const at=beat*beatSeconds;
          const marker=cyclePlan.markers.findLast(marker=>marker.seconds<=at);
          const accent=marker?Math.abs(at-marker.seconds)<.001:false;
          clickEngine.tone(accent?88:80,Math.max(0,origin+at-clickEngine.get().currentTime),.04,accent?.09:.045,"click");
        }
      };
      clickTick.current=scheduleMetronome;
      let visualPlan=cyclePlan,visualOrigin=origin;
      const schedule = () => {
        if(pausedRef.current)return;
        const now=engine.get().currentTime;
        if (now > origin+cyclePlan.seconds) {
          if(!latest.current.loop){stop();return;}
          origin += Math.max(1,Math.floor((now-origin)/Math.max(.1,cyclePlan.seconds)))*cyclePlan.seconds;
          cyclePlan=latest.current.plan; index=0;clickIndex=countBeats;
          clickCursor=new QuarterClickScheduler(latest.current.click);
        }
        while(clickIndex<countBeats&&countOrigin+clickIndex*beatSeconds<=now+.2){
          const at=countOrigin+clickIndex*beatSeconds;const accent=clickIndex++===0;
          if(at>=now-.02)engine.tone(accent?88:80,Math.max(0,at-now),.04,accent?.09:.045,"click");
        }
        scheduleMetronome();
        let guard=0;
        while (guard++ < 5000) {
          if (index >= cyclePlan.events.length) {
            if(!latest.current.loop)break;
            if (origin+cyclePlan.seconds > now+.2 || cyclePlan.seconds <= 0) break;
            origin+=cyclePlan.seconds; cyclePlan=latest.current.plan; index=0;clickIndex=countBeats;
            clickCursor=new QuarterClickScheduler(latest.current.click);
            if (!cyclePlan.events.length) break;
          }
          const event=cyclePlan.events[index];
          if (!event || origin+event.seconds > now+.2) break;
          index++;
          if (origin+event.seconds < now-.02) continue;
          const eventMix=latest.current.mixes.get(event.sectionId)??sectionMix(undefined);
          const settings=eventMix[event.layer], solo=Object.values(eventMix).some(m=>m.solo);
          if (settings.muted || (solo && !settings.solo) || (soloFocusedPart && focusedLayer && event.layer!==focusedLayer) || settings.volume <= 0) continue;
          const delay=Math.max(0,origin+event.seconds-engine.get().currentTime);
          if (event.layer === "drums") {
            const instrument=(Object.entries(DRUM_PITCHES).find(([,pitch])=>pitch===event.pitch)?.[0] as DrumInstrument | undefined);
            if (instrument) engine.drum(instrument,delay,event.velocity, (event.voice ?? "current") as DrumKit,settings.volume*1.04);
          } else {
            const voice=(event.voice ?? (event.layer === "chords" ? "warm pad" : event.layer === "melody" ? "air flute" : event.layer === "bass" ? "deep bass" : "analog pulse")) as SynthVoice;
            const baseGain = event.layer === "chords" ? .052 : event.layer === "melody" ? .058 : event.layer === "bass" ? .094 : .055;
            engine.tone(event.pitch,delay,event.secondsDuration,baseGain*event.velocity*settings.volume,voice);
          }
        }
        // Scheduling can be one lookahead window into the next loop; visuals must not jump early.
        if(now>=origin){visualOrigin=origin;visualPlan=cyclePlan;}
        const elapsed=Math.max(0,now-visualOrigin);
        setProgress(Math.round(Math.max(0,Math.min(1,elapsed/Math.max(.1,visualPlan.seconds)))*100)/100);
        const markerIndex=Math.max(0,visualPlan.markers.findLastIndex(marker=>marker.seconds<=elapsed));
        const marker=visualPlan.markers[markerIndex];
        setPosition(now<countOrigin+countBeats*beatSeconds?`Count-in · ${Math.max(1,Math.min(countBeats,Math.floor((now-countOrigin)/beatSeconds)+1))}`:`Bar ${markerIndex+1} · Beat ${Math.floor((elapsed-(marker?.seconds??0))/beatSeconds)+1}`);
        let offset=0,currentOffset=0,currentId=selectedSection?.id;
        for(const section of previewProject.sections){const duration=timelineDuration(section,project.meter)*beatSeconds;if(elapsed<offset+duration){currentOffset=offset;currentId=section.id;break;}offset+=duration;}
        publishPlayhead(Math.max(0,elapsed-currentOffset));
        const preceding=effectiveScope==="song"?0:project.sections.slice(0,project.sections.findIndex(s=>s.id===selectedSection?.id)).reduce((sum,s)=>sum+timelineDuration(s,project.meter)*beatSeconds,0);
        window.dispatchEvent(new CustomEvent("inspitivity-song-position",{detail:{projectId:project.id,sectionId:currentId,seconds:elapsed+preceding}}));
      };
      schedule(); timer.current=setInterval(schedule,25);
    } catch { setMessage("Audio could not start. Tap Play again."); stop(); }
    finally{setBusy(false);}
  };
  useEffect(()=>{if(autoStart)void start();},[autoStart]);
  const pause=async()=>{
    setBusy(true);pausedRef.current=true;
    const token=generation.current;
    try {await engine.get().suspend();if(token===generation.current){setPaused(true);setPlaying(false);}}
    catch {pausedRef.current=false;setMessage("Pause unavailable. Stop playback and try again.");}
    finally {setBusy(false);}
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
  const elapsedSeconds=Math.round(progress*plan.seconds);
  const formatTime=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.max(0,Math.floor(seconds%60))).padStart(2,"0")}`;
  const mixerChannels=LAYER_LABELS.map(([layer,label])=><div className="mixer-channel" key={layer}><b>{label}</b>
    <button aria-label={`Mute ${label}`} aria-pressed={mix[layer].muted} onClick={()=>updateMix(layer,{muted:!mix[layer].muted})}>Mute</button>
    <button aria-label={`Solo ${label}`} aria-pressed={mix[layer].solo} onClick={()=>updateMix(layer,{solo:!mix[layer].solo})}>Solo</button>
    <label className="track-volume"><span>{Math.round(mix[layer].volume*100)}%</span><input type="range" aria-label={`${label} volume`} min="0" max="1" step="0.05" value={mix[layer].volume} onChange={e=>updateMix(layer,{volume:Number(e.target.value)})} /></label>
  </div>);
  return <section className="section-player" aria-label="Song transport">
    <div className="section-player-heading"><div className="section-player-caption"><p className="eyebrow">{effectiveScope==="song"?"Song":"Section"}</p></div>
      <label className="transport-destination"><span className="sr-only">Play song or section</span><select aria-label="Play song or section" value={playbackSelection} onChange={event=>selectPlayback(event.target.value)}>
        <optgroup label="Full song"><option value="song">Full song · play once</option><option value="song:loop">Full song · loop</option></optgroup>
        <optgroup label="Sections">{project.sections.flatMap(section=>[
          <option key={section.id} value={`section:${section.id}`}>{section.name} · play once</option>,
          <option key={`${section.id}:loop`} value={`section:${section.id}:loop`}>{section.name} · loop</option>,
        ])}</optgroup>
      </select></label>
      <PlayButton playing={playing} pausable label={effectiveScope==="song"?"song":"current section"} disabled={!selectedSection||busy} hint={paused?"Resume playback":undefined} onClick={() => playing ? void pause() : void start()} />
      <button className="section-reset" aria-label="Stop and rewind playback" disabled={busy||(!playing&&!paused)} onClick={stop}>↤</button>
      <span className="transport-time" aria-label={`Playback time ${formatTime(elapsedSeconds)} of ${formatTime(plan.seconds)}`}>{formatTime(elapsedSeconds)} / {formatTime(plan.seconds)}</span>
    </div>
    <progress aria-label="Playback position" max={1} value={progress} />
    <details name="transport-panel" onKeyDown={e=>{if(e.key==="Escape")e.currentTarget.open=false;}} className="transport-preferences"><summary aria-label="Playback options">•••</summary><div><b>{busy?"Preparing audio…":position}</b>{focusedLayer&&<label><input type="checkbox" checked={soloFocusedPart} onChange={e=>{stop();setSoloFocusedPart(e.target.checked);}}/> Solo {LAYER_LABELS.find(([layer])=>layer===focusedLayer)?.[1]}</label>}<label><input type="checkbox" checked={countIn} onChange={e=>setCountIn(e.target.checked)}/> Count-in</label><label><input type="checkbox" checked={click} onChange={e=>toggleClick(e.target.checked)}/> Metronome</label>{!previewOnly&&<><details className="mobile-transport-mixer"><summary>Mixer</summary><div className="mixer-grid">{mixerChannels}</div></details><button onClick={()=>{stop();go("metronome");}}>Open metronome</button><button onClick={()=>{stop();updateProject(p=>({...p,sections:p.sections.map(s=>({...s,mix:automaticSectionMix(s,p)}))}));window.dispatchEvent(new CustomEvent("inspitivity-notice",{detail:"Track levels auto-balanced across the song"}));}}>Auto balance all tracks</button></>}</div></details>
    {!previewOnly&&<details name="transport-panel" onKeyDown={e=>{if(e.key==="Escape")e.currentTarget.open=false;}} className="section-mixer"><summary>Mixer</summary><div className="mixer-grid">{mixerChannels}</div></details>}
    {(busy||message)&&<p role="status">{busy?"Preparing audio…":message}</p>}
  </section>;
}

function PlayButton({ playing, onClick, label, compact = false, className = "", disabled = false, hint, pausable=false }: {
  playing: boolean;
  onClick: () => void;
  label: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  hint?: string;
  pausable?: boolean;
}) {
  const action=playing?(pausable?"Pause":"Stop"):"Play";
  return <button type="button"
    className={`play-control ${playing ? "playing" : ""} ${compact ? "compact" : ""} ${className}`}
    onClick={onClick} disabled={disabled} aria-label={`${action} ${label}`}
    aria-pressed={playing} title={hint ?? `${action} ${label}`}>
    <svg className="play-symbol" aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" fill="currentColor">{playing ? pausable?<path d="M4 3h4v14H4zM12 3h4v14h-4z" />:<rect x="4" y="4" width="12" height="12" rx="1" /> : <path d="M5 3 L17 10 L5 17 Z" />}</svg>
    {!compact && <span>{action}</span>}
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
    ["melody", "♥", "Melody"], ["riff", "⇶", "Pattern"],
    ["metronome", "♩", "Metronome"],
  ];
  return (
    <>
      <Topbar title={projectName ?? title} subtitle={projectName ? title : subtitle} onBack={back} />
      <label className="part-switcher"><span>Part editor</span><select aria-label="Switch part editor" value={active} onChange={event=>go(event.target.value as Screen)}>{destinations.map(([target,,label])=><option key={target} value={target}>{label}</option>)}</select></label>
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

const COMMON_METERS = ["4/4", "3/4", "6/8", "5/4", "7/8", "9/8", "12/8"] as const;
const METER_LABELS: Record<(typeof COMMON_METERS)[number], string> = {
  "4/4":"4/4 · Common time",
  "3/4":"3/4 · Waltz",
  "6/8":"6/8 · Compound duple",
  "5/4":"5/4 · Odd meter",
  "7/8":"7/8 · Odd meter",
  "9/8":"9/8 · Compound triple",
  "12/8":"12/8 · Compound quadruple",
};
function MeterSelect({value,onChange,className=""}:{value:string;onChange:(meter:string)=>void;className?:string}) {
  const [custom,setCustom]=useState(!COMMON_METERS.includes(value as (typeof COMMON_METERS)[number]));
  const [top,bottom]=value.split("/").map(Number);
  useEffect(()=>{
    if(!custom&&!COMMON_METERS.includes(value as (typeof COMMON_METERS)[number]))setCustom(true);
  },[value,custom]);
  return <label className={`global-meter ${className}`}>
    <span>Time signature</span>
    <select aria-label="Time signature" value={custom?"custom":value} onChange={event=>{
      if(event.target.value==="custom")setCustom(true);
      else {setCustom(false);onChange(event.target.value);}
    }}>
      {COMMON_METERS.map(meter=><option key={meter} value={meter}>{METER_LABELS[meter]}</option>)}
      <option value="custom">Custom…</option>
    </select>
    {custom&&<span className="meter-custom-fields">
      <input aria-label="Custom beats per bar" type="number" min="1" max="16" value={top||4} onChange={event=>onChange(`${Math.max(1,Math.min(16,Number(event.target.value)||4))}/${bottom===8?8:4}`)}/>
      <b aria-hidden="true">/</b>
      <select aria-label="Custom beat subdivision" value={bottom===8?8:4} onChange={event=>onChange(`${top||4}/${event.target.value}`)}><option value="4">4</option><option value="8">8</option></select>
    </span>}
  </label>;
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
  const changeMeter=(nextMeter:string)=>update((p)=>({...p,meter:nextMeter,sections:p.sections.map(section=>({...section,meterMap:section.meterMap?.map(value=>value===p.meter?nextMeter:value)}))}));
  return (
    <details className="project-settings-disclosure"><summary>Song settings <span>{project.key} · {project.bpm} BPM · {project.meter}</span></summary>
    <section className="project-context" aria-label="Project music settings">
      <div className="project-context-title">
        <span>Project settings</span>
        <b data-no-translate>{project.name}</b>
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
          value={canonicalMode(mode)}
          onChange={(event) => changeHarmony(root, event.target.value as Mode)}
        >
          {MODES.map((option) => (
            <option key={option} value={option}>{MODE_LABELS[option]}</option>
          ))}
        </select>
      </label>
      <div className="global-tempo">
        <span>Tempo</span>
        <TempoInput label="Project tempo" bpm={project.bpm}
          commit={(bpm) => update((p) => ({ ...p, bpm }))} />
        <b>BPM</b>
      </div>
      <MeterSelect value={project.meter} onChange={changeMeter}/>
      {toggleMetronome&&<button className={`context-metronome ${metronomeEnabled?"active":""}`} aria-pressed={metronomeEnabled} onClick={toggleMetronome}>♩ Metronome</button>}
    </section></details>
  );
}

type EditorMode = "generate" | "edit" | "sound";
function EditorModeTabs({label,value,set}:{label:string;value:EditorMode;set:(value:EditorMode)=>void}){
  return <div className="instrument-mode-tabs" role="group" aria-label={label}>{(["generate","edit","sound"] as const).map(mode=><button key={mode} aria-pressed={value===mode} onClick={()=>set(mode)}>{mode==="generate"?"Generate":mode==="edit"?"Edit Notes":"Edit Sound"}</button>)}</div>;
}
function ChordExplorer({back}:{back:()=>void}) {
  const [prompt,setPrompt]=useState("");
  const [root,setRoot]=useState<Root|"auto">("auto");
  const [mode,setMode]=useState<Mode|"auto">("auto");
  const [bpm,setBpm]=useState(90);
  const [voice,setVoice]=useState<SynthVoice>("warm pad");
  const [rhythm,setRhythm]=useState<ChordRhythm|"auto">("auto");
  const [voicing,setVoicing]=useState<VoicingStyle|"auto">("auto");
  const [click,setClick]=useState(false);
  const [draft,setDraft]=useState(()=>generateThemeDraft({prompt:"warm",seed:17}));
  const [previous,setPrevious]=useState<typeof draft|null>(null);
  const [notice,setNotice]=useState("Choose a theme or describe a feeling to begin.");
  const seed=useRef(17);
  const promptTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const request=useRef<ExplorerOptions|null>(null);
  const engine=useAudioEngine();
  const seconds=beatDurationSeconds(bpm);
  const play=useCallback(()=>{
    chordNoteEvents(draft.chords).forEach(note=>engine.tone(note.pitch,note.start*seconds,note.duration*seconds,.045*note.velocity,voice));
  },[draft,seconds,voice,engine,click]);
  const unlock=useCallback(()=>engine.unlock(undefined,voice==="acoustic guitar",voice==="distorted guitar"),[engine,voice]);
  const transport=useLoopTransport(play,progressionLoopDurationMs(16,bpm),engine.stopAll,unlock,{enabled:click,beatSeconds:seconds,meter:"4/4"});
  const auditionToken=useRef(0);
  const stop=()=>{auditionToken.current++;transport.stop();engine.stopAll();};
  useEffect(()=>()=>{auditionToken.current++;engine.stopAll();},[engine]);
  const commit=(next:typeof draft,source:string)=>{
    stop();setPrevious(draft);setDraft(next);setNotice(source);
  };
  const ai=useThemeAI(feel=>{
    if(request.current) commit(generateThemeDraft({...request.current,feel}),"Local AI interpretation applied. Play the progression or try another variation.");
  });
  const generate=(feel?:ThemeFeel,settings?:Partial<ExplorerOptions>)=>{
    if(promptTimer.current)clearTimeout(promptTimer.current);
    ai.invalidate();
    const options:ExplorerOptions={prompt,seed:++seed.current,feel,root:root==="auto"?undefined:root,mode:mode==="auto"?undefined:mode,rhythm:rhythm==="auto"?undefined:rhythm,voicing:voicing==="auto"?undefined:voicing,...settings};
    request.current=options;
    commit(generateThemeDraft(options),"New progression ready · tap a chord to hear its voicing.");
    if(!feel && prompt.trim()) ai.analyze(prompt);
  };
  const generateRef=useRef(generate);
  useEffect(()=>{generateRef.current=generate;});
  // Typing produces a visible result without requiring a model download.
  useEffect(()=>{
    if(!prompt.trim()) return;
    promptTimer.current=setTimeout(()=>generateRef.current(),700);
    return ()=>{if(promptTimer.current)clearTimeout(promptTimer.current);};
  },[prompt]);
  const position=usePlaybackPosition(bpm,16,.25);
  const sounding=position===null?-1:activeChordIndex(draft.chords.map(chord=>chord.beats),position);
  const audition=async(chord:typeof draft.chords[number])=>{
    stop();const token=auditionToken.current;
    window.dispatchEvent(new Event("inspitivity-solo-preview"));
    if(!await unlock()||token!==auditionToken.current)return;
    chordNoteEvents([chord]).forEach(note=>engine.tone(note.pitch,note.start*seconds,note.duration*seconds,.045*note.velocity,voice));
  };
  return <>
    <Topbar title="Chord explorer" onBack={back}/>
    <div className="tool-layout explorer-workspace is-generate independent-explorer">
      <div className="explorer-composer">
        <section className="theme-explorer" aria-label="Chord and theme explorer">
          <div className="theme-explorer-head"><div><p className="eyebrow">Theme to harmony</p><h2>What should it feel like?</h2><p>Describe a scene or choose a feeling. Chords update as you type.</p></div></div>
          <form className="theme-explorer-form" onSubmit={event=>{event.preventDefault();generate();}}>
            <label htmlFor="explorer-theme">Your theme</label><div><input id="explorer-theme" value={prompt} maxLength={400} onChange={event=>{ai.invalidate();setPrompt(event.target.value);}} placeholder="A warm, nostalgic night drive…"/><button type="submit">Find chords</button></div>
          </form>
          <div className="theme-feel-chips" aria-label="Quick themes">{THEME_FEELS.map(feel=><button type="button" key={feel} aria-pressed={draft.feel===feel} onClick={()=>generate(feel)}>{feel}</button>)}</div>
          <div className="explorer-harmony-controls">
            <Select label="Key" value={root} options={["auto",...ROOTS]} set={value=>{setRoot(value as Root|"auto");generate(draft.feel,{root:value==="auto"?undefined:value as Root});}}/>
            <Select label="Mode" value={mode} options={["auto",...MODES]} set={value=>{setMode(value as Mode|"auto");generate(draft.feel,{mode:value==="auto"?undefined:value as Mode});}}/>
            <label className="select-control"><span>Tempo</span><input aria-label="Explorer tempo" type="number" min={40} max={240} value={bpm} onChange={event=>{stop();setBpm(Math.max(40,Math.min(240,Number(event.target.value)||90)));}}/></label>
          </div>
          <p className="explorer-hint">Auto chooses a key and mode for the feeling. Select either to keep it fixed.</p>
          <div className="theme-local-ai"><span role="status" aria-live="polite">{ai.state.message}</span>{ai.available && (["off","error"].includes(ai.state.phase)?<button type="button" onClick={()=>{ai.enable();if(prompt.trim())ai.analyze(prompt);}}>{ai.state.phase==="error"?"Retry local AI":"Enable local AI"}</button>:<button type="button" onClick={ai.cancel}>Stop local AI</button>)}</div>
          {ai.state.answer&&<details className="explorer-hint"><summary>AI interpretation</summary><p>{ai.state.answer}</p></details>}
        </section>
        <div className="explorer-voicing-controls">
          <Select label="Sound" value={voice} options={SYNTH_VOICES} set={value=>{stop();setVoice(value as SynthVoice);}}/>
          <Select label="Chord voicing" value={voicing} options={["auto","open","close","drop 2","mixed"]} set={value=>{setVoicing(value as VoicingStyle|"auto");generate(draft.feel,{seed:draft.seed,root:draft.root,mode:draft.mode,rhythm:draft.rhythm,voicing:value==="auto"?undefined:value as VoicingStyle});}}/>
          <Select label="Strum rhythm" value={rhythm} options={["auto",...CHORD_RHYTHMS.filter(value=>value!=="adaptive")]} set={value=>{setRhythm(value as ChordRhythm|"auto");generate(draft.feel,{seed:draft.seed,root:draft.root,mode:draft.mode,voicing:draft.voicing,rhythm:value==="auto"?undefined:value as ChordRhythm});}}/>
        </div>
      </div>
      <section className="result-panel" aria-label="Explorer result">
        <div className="result-heading"><div><p className="eyebrow">{draft.feel} · variation {draft.arcIndex+1}</p><h2>{formatProjectKey(draft.root,draft.mode)}</h2></div></div>
        <p className="explorer-hint">{draft.voicing} voicing · {CHORD_RHYTHM_LABELS[draft.rhythm]} · 4 bars</p>
        <SoloPreview transport={transport} click={click} toggleClick={()=>setClick(value=>!value)}/>
        <p className="explorer-status" role="status" aria-live="polite">{notice}</p>
        <div className="chord-overview" aria-label="Generated chord progression">{draft.chords.map((chord,index)=><button key={chord.id} data-playing={sounding===index} onClick={()=>void audition(chord)} aria-label={`Play chord ${index+1}: ${chord.name}`}><span>{index+1}</span><b data-no-translate>{chord.name}</b><small>{chordRole(chord.name,draft.root,draft.mode)}</small><span className="explorer-pitches" data-no-translate>{chord.pitches.map(pitch=><em key={pitch}>{midiNoteName(pitch)}</em>)}</span></button>)}</div>
        <div className="explorer-actions"><button className="primary-button" onClick={()=>generate(draft.feel)}>Another variation</button><button className="secondary-button" disabled={!previous} onClick={()=>{if(previous){ai.invalidate();request.current=null;stop();setDraft(previous);setPrevious(draft);setNotice("Previous idea restored.");}}}>Previous idea</button></div>
      </section>
    </div>
  </>;
}

function SoloPreview({transport,click,toggleClick}:{transport:ReturnType<typeof useLoopTransport>;click:boolean;toggleClick:()=>void}) {
  const [loop,setLoop]=useState(true);
  return <div className="solo-preview" role="group" aria-label="Standalone playback">
    <PlayButton label="standalone idea" playing={transport.mode!=="stopped"} onClick={()=>transport.mode!=="stopped"?transport.stop():void transport.start(loop)} />
    <label><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)} />Loop</label>
    <label><input type="checkbox" checked={click} onChange={toggleClick} />Metronome</label>
  </div>;
}
function GeneratorSettings({ children, className="" }: { children: React.ReactNode; className?: string }) {
  const groups: { title:string; content:React.ReactNode[] }[] = [];
  const actions: React.ReactNode[] = [];
  for (const child of Children.toArray(children)) {
    if (isValidElement<{className?:string;title?:string}>(child) && child.type === "button" && child.props.className?.includes("primary-button")) {
      actions.push(child);
    } else if (isValidElement<{title:string}>(child) && child.type === ControlTitle) {
      groups.push({title:child.props.title,content:[]});
    } else {
      if (!groups.length) groups.push({title:"Starting points",content:[]});
      groups[groups.length-1].content.push(child);
    }
  }
  return <section className={`control-panel generator-inspector ${className}`} aria-label="Idea generation">
    <div className="generator-primary-actions">{actions}</div>
    <details className="generator-options"><summary>Shape & sound <span>Customize this idea</span></summary>
      <div className="generator-settings-body">{groups.map((group,index)=><details className="generator-group" name="generator-group" key={index}>
        <summary>{group.title}</summary><div>{group.content}</div>
      </details>)}</div>
    </details>
  </section>;
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
  const [workspaceMode,setWorkspaceMode]=useState<EditorMode>(idea?"edit":"generate");
  const initialCount = idea?.data?.length || 4;
  const [initialSeed] = useState(() => freshSeed() + Math.max(0, sectionIndex));
  const supportPitchClasses = useMemo(() => sectionPitchContext(section,"chords"),[section]);
  const [count, setCount] = useDraftState("count", initialCount);
  const [defaultBeats, setDefaultBeats] = useDraftState("defaultBeats", meterBeats(project.meter));
  const [lengthVariation, setLengthVariation] = useDraftState("lengthVariation", 0);
  const [complexity, setComplexity] = useDraftState<Complexity>("complexity", "medium");
  const [harmonyColour, setHarmonyColour] = useDraftState<HarmonyColour>("harmonyColour", "diatonic");
  const [opening, setOpening] = useDraftState<ProgressionOpening>("opening", "away");
  const [tension, setTension] = useDraftState<HarmonicTension>("harmonicTension", "balanced");
  const [voice, setVoice] = useDraftState<SynthVoice>("voice", (idea?.voice as SynthVoice) || "distorted guitar");
  const [voicing, setVoicing] = useDraftState<VoicingStyle>("voicing", "mixed");
  const [chordRhythm,setChordRhythm] = useDraftState<ChordRhythm>("chordRhythm",idea && !idea.data?.some(value=>value.split("|")[3]) ? "sustain" : "adaptive");
  const [seed, setSeed] = useDraftState("seed", initialSeed);
  const [chords, setChords] = useDraftState<ChordDraft[]>("chords", () =>
    idea
      ? decodeChordDrafts(idea)
      : rhythmizeChords(makeChordDrafts(root, mode, initialCount, "medium", initialSeed,meterBeats(project.meter),0,"diatonic","away","mixed","balanced",supportPitchClasses),initialSeed,"adaptive",project.meter,section),
  );
  const [previousChords, setPreviousChords] = useDraftState<ChordDraft[] | null>("previousChords", null);
  const engine = useAudioEngine();
  const regenerate = (nextRoot = root, nextMode = mode, showFeedback = true) => {
    setPreviousChords(chords);
    const nextSeed = seed + 1;
    setSeed(nextSeed);
    setChords(
      rhythmizeChords(makeChordDrafts(
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
      ),nextSeed,chordRhythm,project.meter,section),
    );
    if(showFeedback)announceGenerated("Chord progression");
  };
  const totalBeats = chords.reduce((sum, chord) => sum + chord.beats, 0);
  const beatSeconds = beatDurationSeconds(project.bpm);
  const [selectedChordId,setSelectedChordId]=useState<string|null>(null);
  const selectedChord=chords.find(c=>c.id===selectedChordId)??chords[0];
  const chordPosition=usePlaybackPosition(project.bpm,totalBeats,.25);
  const soundingChord=chordPosition===null?-1:activeChordIndex(chords.map(c=>c.beats),chordPosition);
  const play = useCallback(() => {
    chordNoteEvents(chords).forEach(note => engine.tone(note.pitch,note.start*beatSeconds,note.duration*beatSeconds,.045*note.velocity,voice));
  }, [chords, totalBeats, beatSeconds, engine, metronomeEnabled, project.meter, voice]);
  const unlockVoice=useCallback(()=>engine.unlock(undefined,voice==="acoustic guitar",voice==="distorted guitar"),[engine,voice]);
  const transport = useLoopTransport(
    play,
    progressionLoopDurationMs(totalBeats, project.bpm),
    engine.stopAll,
    unlockVoice,
    {enabled:metronomeEnabled,beatSeconds,meter:project.meter},
  );
  const auditionTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const auditionGeneration=useRef(0);
  const stopAudition=useCallback(()=>{
    auditionGeneration.current++;
    if(auditionTimer.current)clearTimeout(auditionTimer.current);
    auditionTimer.current=null;
    engine.stopAll();
  },[engine]);
  useEffect(()=>{
    const cancel=()=>{if(auditionTimer.current)stopAudition();};
    window.addEventListener("inspitivity-context-play",cancel);
    window.addEventListener("inspitivity-solo-preview",cancel);
    return ()=>{
      window.removeEventListener("inspitivity-context-play",cancel);
      window.removeEventListener("inspitivity-solo-preview",cancel);
      cancel();
    };
  },[stopAudition]);
  const auditionChord=async(chord:ChordDraft)=>{
    transport.stop();
    stopAudition();
    window.dispatchEvent(new Event("inspitivity-solo-preview"));
    const token=auditionGeneration.current;
    if(!await unlockVoice()||token!==auditionGeneration.current)return;
    chordNoteEvents([chord]).forEach(note=>engine.tone(note.pitch,note.start*beatSeconds,note.duration*beatSeconds,.045*note.velocity,voice));
    auditionTimer.current=setTimeout(()=>{if(token===auditionGeneration.current)stopAudition();},chord.beats*beatSeconds*1000);
  };
  useEffect(()=>{void transport.refresh();},[voice,transport.refresh]);
  const updateChord = (id: string, changes: Partial<ChordDraft>) =>
    setChords((items) =>
      items.map((chord) =>
        chord.id === id ? { ...chord, ...changes, ...(changes.beats && chord.attacks ? {attacks:chord.attacks.map(a=>({...a,start:a.start*changes.beats!/chord.beats,duration:a.duration*changes.beats!/chord.beats}))} : {}), ...(changes.name ? {pitches:voiceChord(changes.name,seed,voicing)} : {}) } : chord,
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
      {<ToolHeader
        title="Chord Progression"
        subtitle="Shape coherent harmonic arcs, then make them yours"
        projectName={project.name}
        back={back}
        go={go}
        active="chords"
      />}
      <ProjectContext
        project={project}
        update={updateProject}
        onHarmonyChange={(nextRoot, nextMode) => regenerate(nextRoot, nextMode, false)}
        metronomeEnabled={metronomeEnabled}
        toggleMetronome={toggleMetronome}
      />
      {section && (
        <p className="destination-name">
          Editing {section.name} · {section.bars} bars{supportPitchClasses.length ? " · supporting its melody, bass and pattern" : ""}
        </p>
      )}
      <EditorModeTabs label="Chord workspace" value={workspaceMode} set={setWorkspaceMode} />
      {workspaceMode === "generate" && <button className="explorer-entry" onClick={()=>go("explorer")}><b>Chord explorer</b><span>Find voicings for a scene or a feeling</span></button>}

      {workspaceMode==="sound"&&<SoundEditor label="Chord" voice={voice} options={SYNTH_VOICES} change={value=>setVoice(value as SynthVoice)}/>}
      <DraftToolbar />
      {!section && <SoloPreview transport={transport} click={metronomeEnabled} toggleClick={toggleMetronome} />}
      <div className={`tool-layout instrument-workspace is-${workspaceMode}`}>
        {workspaceMode==="generate"&&<GeneratorSettings className="">
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
                setChords(rhythmizeChords(makeChordDrafts(root, mode, count, level, seed + 1, beats, 0, "diatonic", opening, voicing, tension, supportPitchClasses),seed+1,chordRhythm,project.meter,section));
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
              max={Math.max(8,meterBeats(project.meter))}
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
            const voicings=voiceProgression(chords.map(c=>c.name),seed+1,value as VoicingStyle);
            setChords(chords.map((c,i)=>({...c,pitches:voicings[i]})));
          }} />
          {voicing==="drop 2"&&<p className="control-note inline-explanation">Drop 2 lowers the second-highest tone by an octave for a wider, more open chord.</p>}
          <button className="secondary-button wide" onClick={()=>{transport.stop();setSeed(seed+1);const voicings=voiceProgression(chords.map(c=>c.name),seed+1,voicing);setChords(chords.map((c,i)=>({...c,pitches:voicings[i]})));}}>↻ Revoice these chords</button>
          <p className="control-note">
            Each generation explores a new harmonic path. Revoice keeps your chords and changes their inversions, spacing and register.
          </p>
          <button className="primary-button wide" onClick={() => regenerate()}>
            Generate progression <span>↻</span>
          </button>
        </GeneratorSettings>}
        <section className="result-panel">
          {workspaceMode==="generate"&&<VariationControls value={chords} apply={value=>{transport.stop();setChords(value);}} vary={(kind,locks)=>{
            setSeed(seed+1);
            const candidate=makeChordDrafts(root,mode,chords.length,complexity,seed+97,defaultBeats,lengthVariation,harmonyColour,opening,voicing,tension,supportPitchClasses);
            const changeCount=kind==="subtle"?1:Math.max(2,Math.ceil(chords.length/3));
            const varied = chords.map((chord,index)=>({...chord,
              name:!locks.notes && index>=chords.length-changeCount && candidate[index].name!==chord.name ? candidate[index].name : chord.name,
              pitches:!locks.notes && index>=chords.length-changeCount ? candidate[index].pitches : chord.pitches,
              beats:locks.rhythm ? chord.beats : kind==="space" ? Math.min(16,chord.beats*2) : kind==="energy" ? Math.max(1,chord.beats/2) : chord.beats
            }));
            return locks.rhythm ? varied : rhythmizeChords(varied,seed+1,kind==="space"?"sparse":kind==="energy"?"driving":chordRhythm,project.meter,section);
          }} />}
          <div className="result-heading">
            <div>
              <p className="eyebrow">
                {idea ? "Editing saved progression" : "Your progression"}
              </p>
              <h2>{formatProjectKey(root, mode)}</h2>
            </div>

          </div>
          <details className="chord-rhythm-controls">
            <summary>Strum rhythm <span>{chords.reduce((sum,c)=>sum+(c.attacks?.length??1),0)} attacks · edit rhythm</span></summary>
            <div><Select label="Strum rhythm" value={chordRhythm} options={CHORD_RHYTHMS} set={value=>{transport.stop();setPreviousChords(chords);setChordRhythm(value as ChordRhythm);setSeed(seed+1);setChords(rhythmizeChords(chords,seed+1,value as ChordRhythm,project.meter,section));}} />
            <button className="secondary-button" onClick={()=>{transport.stop();setPreviousChords(chords);setSeed(seed+1);setChords(rhythmizeChords(chords,seed+1,chordRhythm,project.meter,section));}}>↻ New rhythm · keep chords</button></div>
          </details>
          {workspaceMode==="edit"&&<button className="danger-outline" disabled={!chords.length} onClick={()=>{transport.stop();setPreviousChords(chords);setChords([]);setSelectedChordId(null);}}>Clear all chords</button>}
          {!chords.length&&<div className="empty-sequence"><b>No chords yet</b><span>Add a chord below or generate a new progression.</span></div>}
          <div className="chord-overview" aria-label="Generated chord progression">
            {chords.map((chord,index)=><button key={chord.id} aria-pressed={(workspaceMode==="edit")&&selectedChord?.id===chord.id} data-playing={soundingChord===index} onClick={()=>{setSelectedChordId(chord.id);setWorkspaceMode("edit");void auditionChord(chord);}} aria-label={`Play and edit chord ${index+1}: ${chord.name}`}>
              <span>{index+1}</span><b>{chord.name}</b><small>{chordRole(chord.name,root,mode)} · {chord.beats} beats</small>
              <span className="chord-rhythm-strip" aria-label={`${chord.attacks?.length??1} attacks; ${(chord.attacks?.[0]?.start??0)<0?"anticipated entry":(chord.attacks?.[0]?.start??0)>0?"offbeat entry":"on beat"}`}>{(chord.attacks??[{start:0}]).map((attack,i)=><i key={i} style={{left:`${Math.max(0,attack.start/chord.beats)*94}%`}} />)}</span>
            </button>)}
          </div>
          {workspaceMode==="edit"&&<>
          <div className="chord-editor focused-chord-editor" aria-label="Selected chord inspector">
            {chords.map((chord, index) => chord.id!==selectedChord?.id?null:(
              <article key={chord.id}>
                <span className="chord-number">{index + 1}</span>
                <label className="select-control"><span>Apply rhythm to this chord</span><select value="" aria-label={`Rhythm for chord ${index+1}`} onChange={event=>{
                  const style=event.target.value as ChordRhythm;
                  transport.stop();setPreviousChords(chords);
                  const attacks=generateChordRhythm([chord],{seed:seed+1,style,beatsPerBar:meterBeats(project.meter)})[0];
                  setSeed(seed+1);setChords(chords.map(c=>c.id===chord.id?{...c,attacks}:c));
                }}><option value="" disabled>Choose a rhythm…</option>{CHORD_RHYTHMS.map(style=><option key={style} value={style}>{CHORD_RHYTHM_LABELS[style]}</option>)}</select></label>
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
                    {[...new Set([...Array.from({length:16},(_,beat)=>beat+1),chord.beats])].sort((a,b)=>a-b).map(beats=><option key={beats} value={beats}>{beats} {beats===1?"beat":`beats${beats===meterBeats(project.meter)?" · one bar":""}`}</option>)}
                  </select>
                </label>
                <button
                  className="remove-chord"
                  aria-label={`Remove chord ${index + 1}`}
                  disabled={false}
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
            onClick={() => {
              const id=uid();setSelectedChordId(id);
              setChords((items) => [
                ...items,
                {
                  id,
                  name: generateChordProgression({root,mode,bars:1,complexity:"simple",opening:"tonic",seed})[0].name,
                  beats: defaultBeats,
                },
              ]);
            }}
          >
            ＋ Add chord
          </button>
          </>}

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
              const notes: MidiNoteEvent[] = chordNoteEvents(chords);
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
  const [workspaceMode,setWorkspaceMode]=useState<EditorMode>(idea?"edit":"generate");
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
  }, [melody, beatSeconds, engine, metronomeEnabled, project.meter, voice]);
  const unlockVoice=useCallback(()=>engine.unlock(undefined,voice==="acoustic guitar",voice==="distorted guitar"),[engine,voice]);
  const transport = useLoopTransport(
    play,
    melodyLoopDurationMs(melody, bpm),
    engine.stopAll,
    unlockVoice,
    {enabled:metronomeEnabled,beatSeconds,meter:project.meter},
  );
  useEffect(()=>{void transport.refresh();},[voice,transport.refresh]);
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
    setWorkspaceMode("edit");
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
    void unlockVoice().then((ready) => { if (ready) engine.tone(pitch, 0, .32, .065, voice); });
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
      {!section && <SoloPreview transport={transport} click={metronomeEnabled} toggleClick={toggleMetronome} />}
      <EditorModeTabs label="Melody workspace" value={workspaceMode} set={setWorkspaceMode} />
      {workspaceMode==="sound"&&<SoundEditor label="Melody" voice={voice} options={SYNTH_VOICES} change={value=>setVoice(value as SynthVoice)}/>}
      <div className={`tool-layout instrument-workspace is-${workspaceMode}`}>
        {workspaceMode==="generate"&&<GeneratorSettings className="violet-panel">
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
              announceGenerated("Melody");
            }}
          >
            Generate melody <span>↻</span>
          </button>
        </GeneratorSettings>}
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

          </div>
          <div className="piano-roll">
            <PlaybackCursor bpm={project.bpm} length={melodyBeats} inset={2} span={94} />
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
                aria-label={`Edit melody note ${i+1}: ${note.note}, ${note.duration.toFixed(2)} beats`}
                onClick={() => {setSelectedNoteIndex(i);setWorkspaceMode("edit");setKeyboardOpen(true);}}
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
          {workspaceMode==="edit"&&<div className={`note-keyboard-dock ${keyboardOpen ? "is-open" : ""}`}>
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
          </div>}
          <details className="tension-details"><summary>Harmony guide</summary><div
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
          </div></details>

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
  const [workspaceMode,setWorkspaceMode]=useState<EditorMode>(idea?"edit":"generate");
  const [pattern, setPattern] = useDraftState<BassDirection>("bassPattern", "groove");
  const [movement, setMovement] = useDraftState<BassMovement>("bassMovement", "supportive");
  const [density,setBassDensity]=useDraftState("bassDensity",.6);
  const [voice, setVoice] = useDraftState<BassVoice>("bassVoice", (idea?.voice as BassVoice) || "deep bass");
  const [lockToKick, setLockToKick] = useDraftState("bassLockToKick", true);
  const [selectedBassIndex, setSelectedBassIndex] = useState<number | null>(null);
  const [seed, setSeed] = useDraftState("bassSeed", () => freshSeed() + Math.max(0, sectionIndex));
  const [savedBass, setSavedBass] = useDraftState<BassEvent[] | null>("savedBass", () => idea ? decodeBassIdea(idea) : null);
  const generated = useMemo(
    () => generateBassLine(project, section, pattern, movement, lockToKick, seed, density),
    [project, section, pattern, movement, lockToKick, seed, density],
  );
  const bass = savedBass ?? generated;
  const harmonyIdea = section?.ideas.find((item) => item.type === "chords");
  const harmonyNames = harmonyIdea
    ? (harmonyIdea.data?.length ? harmonyIdea.data : harmonyIdea.detail.split(" · ")).map((value) => decodeRhythmicChord(value).name)
    : [];
  const beatSeconds = beatDurationSeconds(project.bpm);
  const length = Math.max(.5, ...bass.map((event) => event.start + event.duration));
  const engine = useAudioEngine();
  const play = useCallback(() => {
    bass.forEach((event) => engine.tone(event.pitch, event.start * beatSeconds, event.duration * beatSeconds, event.accent ? .065 : .05, voice));
  }, [bass, beatSeconds, engine, length, metronomeEnabled, project.meter, voice]);
  const transport = useLoopTransport(play, length * beatSeconds * 1000, engine.stopAll, engine.unlock,{enabled:metronomeEnabled,beatSeconds,meter:project.meter});
  useEffect(()=>{void transport.refresh();},[voice,transport.refresh]);
  useDraftPreview({ type:"bass", data:bass.map(encodeBassEvent), voice });
  const regenerate = () => { transport.stop(); setSavedBass(null); setSeed((value) => value + 1); announceGenerated("Bass line"); };
  const updateBassEvent = (index: number, changes: Partial<BassEvent>) => {
    transport.stop();
    setSavedBass((current) => (current ?? generated).map((event,eventIndex) => eventIndex === index ? { ...event, ...changes } : event));
  };
  const addBassEvent = () => {
    transport.stop();
    const start = Math.max(0, ...bass.map((event) => event.start + event.duration));
    const pitch = bass.at(-1)?.pitch ?? bassRootPitch(projectHarmony(project).root);
    setSavedBass([...bass, { pitch, start, duration:.5, accent:false }]);
    setSelectedBassIndex(bass.length);
    setWorkspaceMode("edit");
  };
  const removeBassEvent = (index: number) => {
    if (bass.length === 1) return;
    transport.stop();
    setSavedBass(bass.filter((_,eventIndex) => eventIndex !== index));
    setSelectedBassIndex(null);
  };
  const auditionBassEvent = async (event: BassEvent) => {
    transport.stop();
    if (await engine.unlock()) engine.tone(event.pitch, 0, Math.max(.32,Math.min(.8,event.duration*beatSeconds)), .06, voice);
  };
  const mirrorChordProgression = () => {
    transport.stop();
    setMovement("rooted");
    setSavedBass(null);
    setSelectedBassIndex(null);
    setSeed((value) => value + 1);
  };
  return <>
    <ToolHeader title="Bass Generator" subtitle="Low five-string electric bass shaped around harmony and drums" projectName={project.name} back={back} go={go} active="bass" />
    <ProjectContext project={project} update={updateProject} metronomeEnabled={metronomeEnabled} toggleMetronome={toggleMetronome} />
    {section && <p className="destination-name">Following {section.name} · {section.energy ?? sectionFeel(project,section).energy} energy</p>}
    <DraftToolbar />
      {!section && <SoloPreview transport={transport} click={metronomeEnabled} toggleClick={toggleMetronome} />}
    <EditorModeTabs label="Bass workspace" value={workspaceMode} set={setWorkspaceMode} />
    {workspaceMode==="sound"&&<SoundEditor label="Bass" voice={voice} options={BASS_VOICES} change={value=>setVoice(value as BassVoice)}/>}
      <div className={`tool-layout instrument-workspace is-${workspaceMode}`}>
      {workspaceMode==="generate"&&<GeneratorSettings className="bass-panel">
        <ControlTitle n="1" title="Phrase character" />
        <Select label="Groove direction" value={pattern} options={["sustained","eighth notes","groove","syncopated","progressive"]} set={(value) => { transport.stop(); setSavedBass(null); setPattern(value as BassDirection); }} />
        <Select label="Harmony relationship" value={movement} options={["rooted","supportive","melodic"]} set={(value) => { transport.stop(); setSavedBass(null); setMovement(value as BassMovement); }} />
        {harmonyNames.length>0&&<div className="bass-harmony-map"><span>Section chords</span><b>{harmonyNames.join(" → ")}</b><button className="secondary-button" onClick={mirrorChordProgression}>Mirror chord roots</button></div>}
        <ControlTitle n="2" title="Note density" />
        <label className="range-control"><span>{density<.45?"Sparse":density>.75?"Dense":"Balanced"} · {Math.round(density*100)}%</span><input aria-label="Bass note density" type="range" min=".25" max="1" step=".05" value={density} onChange={event=>{transport.stop();setSavedBass(null);setBassDensity(Number(event.target.value));}}/></label>
        <ControlTitle n="4" title="Rhythm-section lock" />
        <label className="bass-lock"><input type="checkbox" checked={lockToKick} onChange={(event) => { transport.stop(); setSavedBass(null); setLockToKick(event.target.checked); }} /><span>Follow kick attacks when drums exist</span></label>
        <p className="control-note">Rooted mirrors each chord change. Supportive adds chord tones and fifths. Melodic connects the chords with scale movement.</p>
        <button className="primary-button wide" onClick={regenerate}>Generate new bass line <span>↻</span></button>
      </GeneratorSettings>}
      <section className="result-panel bass-result">
        <div className="result-heading"><div><p className="eyebrow">{voice}</p><h2>{pattern} · {movement} · {bass.length} notes</h2></div></div>
        <div className={`bass-roll ${selectedBassIndex!==null&&workspaceMode==="edit"?"has-open-editor":""}`} aria-label="Bass sequencer">
          <PlaybackCursor bpm={project.bpm} length={length} />
          {bass.map((event,index)=><button key={`${event.start}-${index}`} className={`bass-note-block ${event.accent ? "accent" : ""} ${selectedBassIndex===index?"selected":""}`} aria-pressed={selectedBassIndex===index} aria-label={`Edit bass note ${index+1}: ${midiNoteName(event.pitch)}, beat ${event.start+1}`} onClick={()=>{setSelectedBassIndex(index);setWorkspaceMode("edit");}} style={{left:`${(event.start/length)*100}%`,width:`${Math.max(2,(event.duration/length)*100)}%`,bottom:`${18+Math.max(0,Math.min(32,event.pitch-23))*4.3}px`}} title={`${midiNoteName(event.pitch)} · beat ${event.start+1}`}>{midiNoteName(event.pitch)}</button>)}
          {workspaceMode==="edit"&&selectedBassIndex!==null&&bass[selectedBassIndex]&&<div className="bass-note-popover" role="dialog" aria-label={`Edit bass note ${selectedBassIndex+1}`} style={{left:`clamp(8px, ${(bass[selectedBassIndex].start/length)*100}%, calc(100% - 286px))`}}>
            <header><b>Note {selectedBassIndex+1}</b><button aria-label="Close note editor" onClick={()=>setSelectedBassIndex(null)}>×</button></header>
            <div>
              <label><span>Pitch</span><select value={bass[selectedBassIndex].pitch} onChange={change=>updateBassEvent(selectedBassIndex,{pitch:Number(change.target.value)})}>{BASS_PITCHES.map(pitch=><option key={pitch} value={pitch}>{midiNoteName(pitch)}</option>)}</select></label>
              <label><span>Beat</span><input type="number" min="0" max={Math.max(1,length)} step="0.25" value={Number(bass[selectedBassIndex].start.toFixed(3))} onChange={change=>updateBassEvent(selectedBassIndex,{start:Math.max(0,Number(change.target.value))})}/></label>
              <label><span>Length</span><input type="number" min="0.125" max="8" step="0.125" value={Number(bass[selectedBassIndex].duration.toFixed(3))} onChange={change=>updateBassEvent(selectedBassIndex,{duration:Math.max(.125,Number(change.target.value))})}/></label>
            </div>
            <footer><label className="bass-accent"><input type="checkbox" checked={bass[selectedBassIndex].accent} onChange={change=>updateBassEvent(selectedBassIndex,{accent:change.target.checked})}/><span>Accent</span></label><button className="bass-audition" aria-label="Preview note" onClick={()=>void auditionBassEvent(bass[selectedBassIndex])}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg></button><button className="bass-remove" aria-label="Delete note" disabled={bass.length===1} onClick={()=>removeBassEvent(selectedBassIndex)}>×</button></footer>
          </div>}
        </div>
        {workspaceMode==="edit"&&<div className="bass-note-editor" aria-label="Edit bass notes">
          <header><div><b>Edit in the sequencer</b><span>Tap a note block to change pitch, timing, length or accent.</span></div><button onClick={addBassEvent}>＋ Add note</button></header>
        </div>}
        <SaveActions section={section} editing={!!idea} submit={(chooseDestination) => save("bass", `${pattern} bass`, `${bass.length} notes · ${movement} · ${lockToKick ? "kick aware" : "independent pulse"}`, bass.map(encodeBassEvent), chooseDestination, voice)} />
        <button className="export-button wide" onClick={() => downloadMidi(`${project.name}-bass`, createMidiFile({name:`${project.name} bass`,bpm:project.bpm,meter:project.meter,notes:bass,program:MIDI_PROGRAMS[voice]}))}>⇩ Export bass as MIDI</button>
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
  const [workspaceMode,setWorkspaceMode]=useState<EditorMode>(idea?"edit":"generate");
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
  }, [engine, riff, beatSeconds, metronomeEnabled, beats, project.meter, voice]);
  const unlockVoice=useCallback(()=>engine.unlock(undefined,voice==="acoustic guitar",voice==="distorted guitar"),[engine,voice]);
  const transport = useLoopTransport(
    play,
    progressionLoopDurationMs(beats, project.bpm),
    engine.stopAll,
    unlockVoice,
    {enabled:metronomeEnabled,beatSeconds,meter:project.meter},
  );
  useEffect(()=>{void transport.refresh();},[voice,transport.refresh]);
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
      {!section && <SoloPreview transport={transport} click={metronomeEnabled} toggleClick={toggleMetronome} />}
      <EditorModeTabs label="Riff workspace" value={workspaceMode} set={setWorkspaceMode} />
      {workspaceMode==="sound"&&<SoundEditor label="Pattern" voice={voice} options={SYNTH_VOICES} change={value=>setVoice(value as SynthVoice)}/>}
      <div className={`tool-layout instrument-workspace is-${workspaceMode}`}>
        {workspaceMode==="generate"&&<GeneratorSettings className="riff-panel">
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
          <p className="control-note">
            The first note is deliberately displaced. A short pitch cell then
            repeats across the section with one restrained turnaround change.
          </p>
          <button
            className="primary-button wide"
            onClick={() => {
              setSavedRiff(null);
              setSeed((value) => value + 1);
              announceGenerated("Synth pattern");
            }}
          >
            Create another pattern <span>↻</span>
          </button>
        </GeneratorSettings>}
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

          </div>
          <div className="riff-grid" aria-label="Generated synth pattern events">
            <PlaybackCursor bpm={project.bpm} length={beats} span={94} />
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
          {workspaceMode==="edit"&&<div className="bass-note-editor" aria-label="Edit pattern notes"><div className="bass-note-list">{riff.map((note,index)=><article key={index}>
            <span>{index+1}</span><label>Pitch<select aria-label={`Pattern note ${index+1} pitch`} value={note.pitch} onChange={e=>{transport.stop();setSavedRiff(riff.map((n,i)=>i===index?{...n,pitch:Number(e.target.value)}:n));}}>{VOICING_PITCHES.map(pitch=><option key={pitch} value={pitch}>{midiNoteName(pitch)}</option>)}</select></label>
            <label>Start<input aria-label={`Pattern note ${index+1} start`} type="number" min="0" max={beats-.125} step=".125" value={note.start} onChange={e=>setSavedRiff(riff.map((n,i)=>i===index?{...n,start:Math.max(0,Math.min(beats-.125,Number(e.target.value)))}:n))}/></label>
            <label>Length<input aria-label={`Pattern note ${index+1} length`} type="number" min=".125" max="8" step=".125" value={note.duration} onChange={e=>setSavedRiff(riff.map((n,i)=>i===index?{...n,duration:Math.max(.125,Math.min(8,Number(e.target.value)))}:n))}/></label>
            <label>Accent<input type="checkbox" checked={note.accent} onChange={e=>setSavedRiff(riff.map((n,i)=>i===index?{...n,accent:e.target.checked}:n))}/></label>
            <button aria-label={`Remove pattern note ${index+1}`} disabled={riff.length===1} onClick={()=>setSavedRiff(riff.filter((_,i)=>i!==index))}>×</button>
          </article>)}</div><button onClick={()=>setSavedRiff([...riff,{pitch:riff.at(-1)?.pitch??48,start:Math.min(beats-.125,(riff.at(-1)?.start??0)+.5),duration:.25,accent:false,muted:false}])}>＋ Add note</button></div>}
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
  const [workspaceMode,setWorkspaceMode]=useState<EditorMode>(idea?"edit":"generate");
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
  const drumEnergy: GrooveEnergy = energy === "sparse" ? "mellow" : energy === "driving" ? "powerful" : energy;
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
  const drumPosition=usePlaybackPosition(project.bpm,phraseBeats,.25);
  const playingStep=drumPosition===null?-1:Math.floor(drumPosition*4);
  const [selectedDrum,setSelectedDrum]=useState<DrumInstrument>("kick");
  const [followPlayback,setFollowPlayback]=useState(true);
  const supportingAnchors = useMemo(() => sectionRhythmicAnchors(section,"drums"),[section]);
  const activeBar = Math.min(followPlayback&&drumPosition!==null?Math.floor(drumPosition/beatsPerBar):visibleBar,bars-1);
  const [seed, setSeed] = useDraftState("seed", () => freshSeed() + Math.max(0, sectionIndex));
  const [voice, setVoice] = useDraftState<DrumKit>("kit", (idea?.voice as DrumKit) || "acoustic studio");
  const [sampleStatus,setSampleStatus]=useState("");
  const drumPaint=useRef<{instrument:DrumInstrument;mode:"add"|"erase";last:number}|null>(null);
  const [savedLoop, setSavedLoop] = useDraftState<DrumHit[] | null>("savedLoop", () =>
    idea ? decodeDrumIdea(idea) : null,
  );
  const engine = useAudioEngine();
  const generatedLoop = useMemo(
    () => reinforceDrumAccents(generateDrumLoop({ beatsPerBar, density, style, energy:drumEnergy, seed, bars, fill }),supportingAnchors,phraseBeats*4),
    [beatsPerBar, density, style, drumEnergy, seed, bars, fill,supportingAnchors,phraseBeats],
  );
  const loop = savedLoop ?? generatedLoop;
  const beatSeconds = beatDurationSeconds(project.bpm);
  const play = useCallback(() => {
    playDrumLoop(engine, loop, 0, 1, phraseBeats, beatSeconds, voice);
  }, [engine, loop, phraseBeats, beatSeconds, voice, metronomeEnabled, drumMeter]);
  const unlockDrums=useCallback(async()=>{
    setSampleStatus(voice==="current"?"":"Preparing acoustic samples…");
    const ready=await engine.unlock(voice);
    setSampleStatus(ready?"":"Audio or samples unavailable. Check your connection and try Play again.");
    return ready;
  },[engine,voice]);
  const transport = useLoopTransport(
    play,
    progressionLoopDurationMs(phraseBeats, project.bpm),
    engine.stopAll,
    unlockDrums,
    {enabled:metronomeEnabled,beatSeconds,meter:drumMeter},
  );
  useEffect(()=>{void transport.refresh();},[voice,transport.refresh]);
  const kitPreviewGeneration=useRef(0);
  const chooseKit=(value:string)=>{
    const next=value as DrumKit;
    setVoice(next);
    setSampleStatus(next==="current"?"":"Preparing acoustic samples…");
    const generation=++kitPreviewGeneration.current;
    if(transport.mode!=="stopped")return; // Active playback restarts with the selected kit.
    engine.stopAll();
    void engine.unlock(next).then(ready=>{
      if(generation!==kitPreviewGeneration.current)return;
      setSampleStatus(ready?"":"Audio or samples unavailable. Check your connection and try Play again.");
      if(ready){engine.drum("kick",0,.8,next);engine.drum("snare",.24,.75,next);}
    });
  };
  const regenerate = () => {
    setSavedLoop(null);
    setSeed((current) => current + 1);
    announceGenerated("Drum phrase");
  };
  const paintHit=(instrument:DrumInstrument,step:number,mode:"add"|"erase")=>{
    const next=[...loop];
    const index=next.findIndex(hit=>hit.instrument===instrument&&Math.round(hit.step)===step);
    if(mode==="erase"&&index>=0)next.splice(index,1);
    if(mode==="add") {
      if(index>=0)next[index]={...next[index],velocity:editVelocity};
      else next.push({instrument,step,velocity:editVelocity});
    }
    setSavedLoop(next.sort((a,b)=>a.step-b.step||DRUM_INSTRUMENTS.indexOf(a.instrument)-DRUM_INSTRUMENTS.indexOf(b.instrument)));
  };
  const hitAtStep=(instrument:DrumInstrument,step:number)=>loop.find(hit=>hit.instrument===instrument&&Math.round(hit.step)===step);
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
      <EditorModeTabs label="Drum workspace" value={workspaceMode} set={setWorkspaceMode} />
      {workspaceMode==="sound"&&<SoundEditor label="Drum" voice={voice} options={DRUM_KITS} change={chooseKit}/>}
      <DraftToolbar />
      {!section && <SoloPreview transport={transport} click={metronomeEnabled} toggleClick={toggleMetronome} />}
      <div className={`tool-layout instrument-workspace is-${workspaceMode}`}>
        {workspaceMode==="generate"&&<GeneratorSettings className="drum-panel">
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
          <details className="advanced-controls"><summary>Phrase & fills</summary>
            <Select label="Phrase length" value={String(bars)} options={["1","2","4","8"]} set={value=>{transport.stop();setBars(Number(value));setVisibleBar(0);setSavedLoop(null);}} />
            <label className="range-control"><span>Fill chance · {Math.round(fill*100)}%</span><input aria-label="Fill chance" type="range" min="0" max="1" step=".1" value={fill} onChange={e=>{setFill(Number(e.target.value));setSavedLoop(null);}} /></label>
          </details>
          <button
            className="primary-button coral-button wide"
            onClick={regenerate}
          >
            Generate new phrase <span>↻</span>
          </button>
        </GeneratorSettings>}
        <section className="result-panel">
          {workspaceMode==="generate"&&<VariationControls percussion value={loop} apply={value=>{transport.stop();setSavedLoop(value);}} vary={(kind,locks)=>{
            setSeed(seed+1);
            let next=loop.map(hit=>({...hit,velocity:Math.max(.2,Math.min(1,hit.velocity*(kind==="space"?.82:kind==="energy"?1.15:(hit.step%4===0?1.04:.92))))}));
            if(!locks.rhythm && kind==="space") next=next.filter(hit=>hit.instrument!=="hihat" || hit.step%4===0);
            if(!locks.rhythm && kind==="energy") for(let step=0;step<phraseBeats*4;step+=2) if(!next.some(hit=>hit.instrument==="hihat"&&hit.step===step))next.push({instrument:"hihat",step,velocity:.5});
            return next.sort((a,b)=>a.step-b.step);
          }} />}
          <div className="result-heading">
            <div>
              <p className="eyebrow coral-text">
                {idea ? "Editing saved drum loop" : "Your drum loop"}
              </p>
              <h2>
                {energy} {style} pocket · {drumMeter}
              </h2>
            </div>

          </div>
          {workspaceMode==="edit"&&<button className="danger-outline" disabled={!loop.length} onClick={()=>{transport.stop();setSavedLoop([]);}}>Clear all drums</button>}
          {sampleStatus&&<p role="status">{sampleStatus}</p>}
          <div className="phrase-bars" aria-label="Phrase bars">{Array.from({length:bars},(_,i)=><button key={i} aria-pressed={activeBar===i} onClick={()=>{setFollowPlayback(false);setVisibleBar(i);}}>Bar {i+1}{i===bars-1 && bars>1 ? " · fill" : ""}</button>)}</div>
          <label className="follow-playback"><input type="checkbox" checked={followPlayback} onChange={e=>setFollowPlayback(e.target.checked)} /> Follow playback</label>
          {workspaceMode==="edit"&&<label className="drum-lane-picker">Drum lane<select value={selectedDrum} onChange={e=>setSelectedDrum(e.target.value as DrumInstrument)}>{DRUM_INSTRUMENTS.map(instrument=><option key={instrument} value={instrument}>{DRUM_LABELS[instrument]}</option>)}</select></label>}
          {workspaceMode==="edit"&&<><div className="drum-edit-tools"><span>Hit strength</span><Segment options={["ghost", "normal", "accent"]} value={editVelocity<.4?"ghost":editVelocity>.9?"accent":"normal"} set={value=>setEditVelocity(value==="ghost"?.3:value==="accent"?1:.75)} /></div>
          <p className="drum-audition-hint">Tap a step to add or remove a hit. Drag across the lane and release to fill a range. Brighter steps play louder.</p></>}
          <div
            className="drum-sequencer"
            role="grid"
            aria-label="Drum pattern editor"
            aria-hidden={workspaceMode === "generate" ? true : undefined}
            onPointerMove={event=>{
              if(!drumPaint.current)return;
              const cell=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLButtonElement>("button[data-drum-step]");
              if(!cell)return;
              const step=Number(cell.dataset.drumStep),instrument=cell.dataset.drumInstrument as DrumInstrument;
              if(instrument===drumPaint.current.instrument&&step!==drumPaint.current.last){drumPaint.current.last=step;paintHit(instrument,step,drumPaint.current.mode);}
            }}
            onPointerUp={()=>{drumPaint.current=null;}}
            onPointerCancel={()=>{drumPaint.current=null;}}
            onKeyDown={event => {
              if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key)) return;
              const cells = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')).filter(cell => cell.getClientRects().length > 0);
              const index = cells.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return;
              event.preventDefault();
              const rowStart = Math.floor(index / steps.length) * steps.length;
              const next = event.key === "Home" ? rowStart : event.key === "End" ? rowStart + steps.length - 1 : index + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -steps.length : steps.length);
              cells[Math.max(0,Math.min(cells.length-1,next))]?.focus();
            }}
          >
            <div className="drum-ruler" aria-hidden="true" style={{gridTemplateColumns:`76px repeat(${steps.length}, minmax(24px,1fr))`}}><span>BAR {activeBar+1}</span>{steps.map((step,i)=><span key={step}>{i%4===0 ? i/4+1 : i%4===2 ? "+" : "·"}</span>)}</div>
            {DRUM_INSTRUMENTS.map((instrument) => workspaceMode==="generate"&&!["kick","snare","hihat","crash"].includes(instrument) ? null : (
              <div
                className="drum-row"
                role="row"
                data-mobile-hidden={workspaceMode==="edit"&&selectedDrum!==instrument}
                key={instrument}
                style={{
                  gridTemplateColumns: `76px repeat(${steps.length}, minmax(24px, 1fr))`,
                }}
              >
                <b role="rowheader">{DRUM_LABELS[instrument]}</b>
                {steps.map((step) => (
                  <button
                    key={step}
                    role="gridcell"
                    tabIndex={workspaceMode === "edit" && step === steps[0] ? 0 : -1}
                    data-playing={playingStep===step}
                    data-drum-step={step}
                    data-drum-instrument={instrument}
                    aria-selected={Boolean(hitAtStep(instrument,step))}
                    style={{ opacity:hitAtStep(instrument,step) ? .35+.65*(hitAtStep(instrument,step)?.velocity ?? 0) : 1 }}
                    className={
                      hitAtStep(instrument,step)
                        ? "active"
                        : ""
                    }
                    aria-label={workspaceMode==="edit"?`${DRUM_LABELS[instrument]}, bar ${activeBar+1}, step ${step-activeBar*beatsPerBar*4+1}${hitAtStep(instrument,step)&&!Number.isInteger(hitAtStep(instrument,step)!.step)?", swung":""}, velocity ${Math.round((hitAtStep(instrument,step)?.velocity ?? 0)*100)}%`:`Open editor for ${DRUM_LABELS[instrument]}`}
                    onPointerDown={event=>{
                      if(workspaceMode!=="edit"){setWorkspaceMode("edit");return;}
                      event.preventDefault();
                      const exists=Boolean(hitAtStep(instrument,step));
                      const mode=exists?"erase":"add";
                      drumPaint.current={instrument,mode,last:step};paintHit(instrument,step,mode);
                    }}
                    onClick={event=>event.preventDefault()}
                  />
                ))}
              </div>
            ))}
          </div>
          {workspaceMode==="generate"&&<button className="edit-pattern-callout" onClick={()=>setWorkspaceMode("edit")}>Edit all drum lanes and velocities <span>→</span></button>}

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
  compact,
  setCompact,
  restore,
  syncStatus,
  projects,
  backUp,
  phoneInstall,
  notify,
  theme,
  setTheme,
  language,
  setLanguage,
}: {
  compact: boolean;
  setCompact: (value:boolean) => void;
  projects: Project[];
  backUp: () => void | Promise<void>;
  restore: (file: File) => Promise<void>;
  syncStatus: string;
  phoneInstall: ReturnType<typeof usePhoneInstall>;
  notify: (message: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
}) {
  const installOnPhone = async () => {
    const installed = await phoneInstall.install();
    if (installed) notify("Inspitivity added to your phone");
  };

  return (
    <>
      <Topbar title="Settings" subtitle="Your ideas, on every device" />
      <div className="settings-card compact language-settings">
        <h2>Language</h2>
        <p>Choose the interface language. Saved on this device.</p>
        <div className="language-options" role="group" aria-label="Language">
          <button aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
          <button aria-pressed={language === "de"} onClick={() => setLanguage("de")}>German</button>
        </div>
      </div>
      <div className="settings-card">
        <h2>Interface density</h2>
        <label className="density-choice"><input type="checkbox" checked={compact} onChange={event=>setCompact(event.target.checked)} /> Compact mode</label>
        <p>Smaller text, tighter menus and a shorter playback bar. Saved on this device.</p>
      </div>
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
        <span className="settings-icon"><GearIcon /></span>
        <h2>Your ideas stay yours.</h2>
        <p>
          Projects and recordings sync privately through this site unless you explicitly add a collaborator. A device copy keeps your work available offline. Draft experiments stay on the device until you save them to a section.
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
        <h3>Sound credits</h3>
        <p>Acoustic drums use Salamander and Virtuosity recordings. Rock and Progressive metal use a second sampled kit; the electronic kit uses synthesis. <a href="/audio/salamander/CREDITS.md" target="_blank" rel="noreferrer">Salamander credits</a> · <a href="/audio/virtuosity/CREDITS.md" target="_blank" rel="noreferrer">Virtuosity credits</a> · <a href="/audio/virtuosity/LICENSE.txt" target="_blank" rel="noreferrer">Sample license</a></p>
        <p>Distorted electric guitar notes from FreePats, converted and trimmed for fast playback. <a href="/audio/electric-guitar/CREDITS.md" target="_blank" rel="noreferrer">Credits and modifications</a> · <a href="/audio/electric-guitar/LICENSE.txt" target="_blank" rel="noreferrer">Sample license</a></p>
      </div>
      <div className="settings-card compact">
        <h3>Account and storage</h3>
        <p>
          Projects and recordings are stored under your signed-in ChatGPT account and synchronized across devices. Shared projects also appear for collaborators you add by email. This device keeps a local working copy for resilience; unsaved drafts remain on this device.
        </p>
      </div>
    </>
  );
}

function ShareProjectModal({
  project,
  close,
  sync,
  left,
}: {
  project: Project;
  close: () => void;
  sync: () => Promise<void>;
  left: () => void;
}) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Loading access…");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/shares?project_id=${encodeURIComponent(project.id)}`;
  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache:"no-store" });
      const body = await response.json() as ShareInfo & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load project access.");
      setInfo(body);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load project access.");
    }
  }, [endpoint]);
  useEffect(() => { void load(); }, [load]);
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setStatus("Syncing the latest project first…");
    try {
      await sync();
      const response = await fetch("/api/shares", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ projectId:project.id, email:email.trim() }),
      });
      const body = await response.json() as ShareInfo & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not add collaborator.");
      setInfo(body);
      setEmail("");
      setStatus("Collaborator added. Their matching ChatGPT account now receives this project.");
      await sync();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add collaborator.");
    } finally { setBusy(false); }
  };
  const remove = async (memberEmail?: string) => {
    if (busy) return;
    setBusy(true);
    setStatus(memberEmail ? "Removing access…" : "Leaving project…");
    try {
      const suffix = memberEmail ? `&email=${encodeURIComponent(memberEmail)}` : "";
      const response = await fetch(`${endpoint}${suffix}`, { method:"DELETE" });
      const body = await response.json() as ShareInfo & { error?: string; left?: boolean };
      if (!response.ok) throw new Error(body.error || "Could not update project access.");
      if (body.left) { left(); return; }
      setInfo(body);
      setStatus("Access updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update project access.");
    } finally { setBusy(false); }
  };
  return (
    <div className="modal-layer" role="presentation">
      <div className="modal small share-project-modal" role="dialog" aria-modal="true" aria-labelledby="share-project-title">
        <button className="modal-close" onClick={close} aria-label="Close">×</button>
        <p className="eyebrow">Collaboration</p>
        <h2 id="share-project-title">Share “{project.name}”</h2>
        <p className="share-explainer">Everyone with access works on the same project across their devices. Changes merge through account sync.</p>
        {info?.canManage && <form className="share-invite" onSubmit={invite}>
          <label className="field"><span>Collaborator’s ChatGPT email</span><input type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="musician@example.com" /></label>
          <button className="primary-button" disabled={busy || !email.trim()} type="submit">Add collaborator</button>
        </form>}
        {info && <div className="share-members" aria-label="People with access">
          <article><span className="share-avatar" aria-hidden="true">●</span><div><b>{info.ownerEmail}</b><small>Owner</small></div></article>
          {info.members.map((member)=><article key={member.email}><span className="share-avatar collaborator" aria-hidden="true">●</span><div><b>{member.email}</b><small>Can edit</small></div>{info.canManage && <button disabled={busy} onClick={()=>void remove(member.email)} aria-label={`Remove ${member.email}`}>Remove</button>}</article>)}
          {!info.members.length && <p className="share-empty">Only you have access.</p>}
        </div>}
        {status && <p className="share-status" role="status">{status}</p>}
        {info && !info.canManage && <button className="leave-project" disabled={busy} onClick={()=>void remove()}>Leave shared project</button>}
      </div>
    </div>
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
  submit: (name: string, bpm: number, key: string, meter: string) => void;
}) {
  const [name, setName] = useState("");
  const [bpm, setBpm] = useState(120);
  const [root, setRoot] = useState("E");
  const [mode, setMode] = useState("dorian");
  const [meter,setMeter]=useState("4/4");
  return (
    <div className="modal-layer">
      <div className="modal project-create-modal" role="dialog" aria-modal="true" aria-labelledby="project-create-title">
        <button className="modal-close" onClick={close} aria-label="Close new project">
          ×
        </button>
        <p className="eyebrow">New project</p>
        <h2 id="project-create-title">What are you making?</h2>
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
              min="30"
              max="260"
              step="1"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              onBlur={() => setBpm(bpm > 0 ? clampBpm(bpm) : 120)}
            />
          </label>
          <Select label="Root" value={root} set={setRoot} options={ROOTS} />
        </div>
        <Select
          label="Mode"
          value={mode}
          set={setMode}
          options={[...SELECTABLE_MODES]}
        />
        <MeterSelect value={meter} onChange={setMeter} className="modal-meter"/>
        <button
          className="primary-button wide"
          disabled={!name.trim()}
          onClick={() => submit(name.trim(), bpm, `${root} ${mode}`, meter)}
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
    a: "project" | "record" | "chords" | "bass" | "melody" | "drums" | "riff",
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
            tone="amber"
            icon="●"
            title="Drum loop"
            copy="Build a pocket"
            onClick={() => choose("drums")}
          />
         <ToolButton
            tone="violet"
            icon="♯"
            title="New progression"
            copy="Find the harmony"
            onClick={() => choose("chords")}
          />
          <ToolButton
            tone="blue"
            icon="♭"
            title="Bass line"
            copy="Connect harmony and drums"
            onClick={() => choose("bass")}
          />
          <ToolButton
            tone="coral"
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
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
        }}
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
              <option key={project.id} value={project.id} data-no-translate>
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
              <option key={section.id} value={section.id} data-no-translate>
                {section.name}
              </option>
            ))}
          </select>
        </label>
        {destinationSection ? (
          <p className="save-destination-summary">
            {idea.name} will be added to <b data-no-translate>{destinationSection.name}</b> in{" "}
            <b data-no-translate>{destinationProject.name}</b>.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryBlob, setRetryBlob] = useState<Blob | null>(null);
  const mounted = useRef(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const clock = useRef<number | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (clock.current !== null) clearInterval(clock.current);
      const media = recorder.current;
      if (media) {
        media.onstop = null;
        media.ondataavailable = null;
        media.onerror = null;
        if (media.state !== "inactive") media.stop();
        media.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  const saveBlob = async (blob: Blob) => {
    setBusy(true);
    setError("");
    setRetryBlob(blob);
    try {
      if (!blob.size) throw new Error("empty recording");
      const id = uid();
      await saveRecording(id, blob);
      if (!mounted.current) return;
      attach(sectionId, {
        id: uid(), type: "audio", name,
        detail: `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} · recorded locally`,
        recordingId: id,
      });
      close();
    } catch {
      if (mounted.current) setError(blob.size ? "Could not save the recording. Keep this window open and retry." : "No audio was captured. Start a new recording.");
      if (!blob.size) setRetryBlob(null);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const start = async () => {
    if (busy || !sectionId) return;
    setBusy(true);
    setError("");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const media = new MediaRecorder(stream);
      recorder.current = media;
      chunks.current = [];
      media.ondataavailable = (e) => chunks.current.push(e.data);
      media.onerror = () => {
        media.onstop = null;
        media.stream.getTracks().forEach(track => track.stop());
        if (clock.current !== null) clearInterval(clock.current);
        setRecording(false);
        setError("Recording was interrupted. Start a new recording.");
      };
      media.start();
      setElapsed(0);
      setRecording(true);
      clock.current = window.setInterval(() => setElapsed((t) => t + 1), 1000);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      if (mounted.current) setError("Could not start recording. Check microphone permission and browser support.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const stop = () => {
    const media = recorder.current;
    if (!media || media.state === "inactive") return;
    setBusy(true);
    media.onstop = () => {
      media.stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks.current, {
        type: media.mimeType || "audio/webm",
      });
      if (mounted.current) void saveBlob(blob);
    };
    media.stop();
    if (clock.current) clearInterval(clock.current);
    setRecording(false);
  };
  return (
    <div className="modal-layer">
      <div className="modal recorder-modal">
        <button className="modal-close" aria-label="Close recorder and discard unsaved recording" disabled={busy} onClick={close}>
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
          disabled={busy || !sectionId}
          onClick={retryBlob ? () => void saveBlob(retryBlob) : recording ? stop : start}
        >
          {busy ? "Please wait…" : retryBlob ? "Retry saving recording" : recording ? "■ Stop & save" : "● Start recording"}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
