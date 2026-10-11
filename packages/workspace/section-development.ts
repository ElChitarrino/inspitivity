import {
  generateChordProgression,
  generateMelody,
  seededRandom,
  voiceChord,
} from "../music-theory/index.js";
import { decodeRhythmicChord, generateChordRhythm } from "../music-theory/chord-rhythm.js";
import { drumPatternBeats } from "../sequencing/index.js";
import { generateBassPhrase } from "./bass.js";
import type { Idea, Project, SongSection } from "./index.js";
import { buildSketchGroove, chooseSketchGroove, heavyPowerVoicing } from "./sketch-grammar.js";
import type { SongLayer } from "./music.js";
import { MUSICAL_DIRECTIONS, type MusicalDirection } from "./directions.js";
import { varyNotes } from "./variation.js";
import {
  decodePitchedNotes,
  encodeBassNote,
  encodeChord,
  encodePitchedNote,
  midiNoteName,
  readHarmonyData,
} from "./idea-codecs.js";
import { harmonyTimeline, sectionContext } from "./section-context.js";

export const CREATIVE_LAYERS: readonly SongLayer[] = ["chords", "drums", "bass", "melody", "riff"];
export type SectionLocks = Partial<Record<SongLayer, boolean>>;
export type SectionChange = "subtle" | "space" | "energy";
export type SectionRole = "verse" | "chorus" | "bridge" | "return";
type MusicalContext = ReturnType<typeof sectionContext>;
type ChangedIdea = { idea: Idea; summary: string };

function varyHarmony(
  idea: Idea,
  context: MusicalContext,
  anchored: boolean,
  change: SectionChange,
  seed: number,
  direction?: MusicalDirection,
): ChangedIdea {
  const previous = readHarmonyData(idea).map(decodeRhythmicChord);
  const profile = direction ? MUSICAL_DIRECTIONS[direction] : undefined;
  const preserveRoots = anchored || change === "subtle";
  const symbols = preserveRoots
    ? previous.map((chord) => chord.name)
    : generateChordProgression({
        root: context.root,
        mode: context.mode,
        bars: previous.length,
        complexity: idea.voice === "distorted guitar" ? "simple" : "medium",
        seed,
        tension: profile?.tension ?? "smooth",
        degreePattern: profile?.degrees[Math.floor(seededRandom(seed)() * profile.degrees.length)],
      }).map((chord) => chord.name);
  const chords = previous.map((chord, index) => ({
    ...chord,
    name: symbols[index],
    pitches:
      idea.voice === "distorted guitar"
        ? heavyPowerVoicing(symbols[index])
        : voiceChord(symbols[index], seed + index * 17, change === "space" ? "open" : "mixed"),
  }));
  const style =
    change === "space"
      ? "sustain"
      : change === "energy"
        ? "eighths"
        : (profile?.rhythm ?? "adaptive");
  const attacks = generateChordRhythm(chords, { seed, style });
  const data = chords.map((chord, index) => encodeChord({ ...chord, attacks: attacks[index] }));
  return {
    idea: { ...idea, data, detail: symbols.join(" · ") },
    summary: anchored
      ? "Harmony anchors retained; new voicings and attacks"
      : "Harmony and chord rhythm varied",
  };
}

function varyDrums(
  idea: Idea,
  beatsPerBar: number,
  change: SectionChange,
  seed: number,
): ChangedIdea {
  const cycle = drumPatternBeats(idea.data ?? [], beatsPerBar);
  const hits = (idea.data ?? [])
    .map((encoded) => {
      const [instrument, step, velocity] = encoded.split("|");
      return { instrument, step: Number(step), velocity: Number(velocity) || 0.7 };
    })
    .filter((hit) => Number.isFinite(hit.step) && hit.step >= 0 && hit.step < cycle * 4);
  const retained = hits.filter(
    (hit, index) =>
      change !== "space" ||
      !["hihat", "openhat", "ride"].includes(hit.instrument) ||
      Math.round(hit.step) % 4 === 0 ||
      index % 3 === 0,
  );
  if (change === "energy") {
    for (let beat = 0; beat < cycle; beat += 0.5) {
      const step = beat * 4;
      const existingHat = retained.some(
        (hit) => hit.instrument === "hihat" && Math.abs(hit.step - step) < 1,
      );
      if (!existingHat)
        retained.push({ instrument: "hihat", step, velocity: beat % 1 === 0 ? 0.57 : 0.34 });
    }
  }
  if (change === "subtle") {
    const step = Math.max(0, Math.floor(seededRandom(seed)() * Math.max(1, cycle - 1)) * 4 + 3);
    if (!retained.some((hit) => hit.instrument === "kick" && hit.step === step))
      retained.push({ instrument: "kick", step, velocity: 0.58 });
  }
  const data = retained
    .sort((a, b) => a.step - b.step)
    .map((hit, index) => {
      const gain =
        change === "space" ? 0.78 : change === "energy" ? 1.12 : 0.94 + ((index + seed) % 3) * 0.06;
      const velocity = Math.max(0.18, Math.min(0.95, hit.velocity * gain));
      return `${hit.instrument}|${hit.step}|${velocity.toFixed(3)}|${cycle}`;
    });
  const summary =
    change === "space"
      ? "Fewer cymbal notes; softer backbeat"
      : change === "energy"
        ? "Denser hats; stronger accents"
        : "Backbeat kept; kick pickup and accents varied";
  return { idea: { ...idea, data, detail: `${data.length} hits` }, summary };
}

function generateSectionBass(
  project: Project,
  section: SongSection,
  chordData: string[],
  drumData: string[],
  change: SectionChange,
  seed: number,
) {
  const context = sectionContext(project, section);
  return generateBassPhrase({
    root: context.root,
    mode: context.mode,
    length: context.length,
    meter: project.meter,
    meterMap: section.meterMap,
    harmony: chordData.map((encoded) => {
      const chord = decodeRhythmicChord(encoded);
      return { symbol: chord.name, beats: chord.beats };
    }),
    direction: change === "space" ? "sustained" : change === "energy" ? "eighth notes" : "groove",
    movement: "supportive",
    lockToKick: true,
    kickStarts: drumData
      .filter((encoded) => encoded.startsWith("kick|"))
      .map((encoded) => Number(encoded.split("|")[1]) / 4),
    kickCycle: drumPatternBeats(drumData, context.barLengths[0]),
    density: change === "space" ? 0.3 : change === "energy" ? 0.8 : 0.55,
    repeatRhythm: true,
    seed,
  });
}

function varyLead(
  idea: Idea,
  context: MusicalContext,
  chordData: string[],
  change: SectionChange,
  seed: number,
): ChangedIdea {
  const notes = decodePitchedNotes(idea);
  if (!notes.length) return { idea, summary: "No playable notes to vary" };
  const harmony = harmonyTimeline(chordData);
  const varied = varyNotes(
    notes,
    change,
    { notes: false, rhythm: false },
    context.scale,
    seed + 43,
  ).filter((note) => note.start < context.length);
  const data = varied.map((note) =>
    encodePitchedNote(idea.type, {
      ...note,
      pitch: harmony.fitPitch(note.pitch, note.start),
      duration: Math.max(0.125, Math.min(note.duration, context.length - note.start)),
    }),
  );
  const cycleBeats =
    idea.cycleBeats ?? Math.max(0.125, ...notes.map((note) => note.start + note.duration));
  return {
    idea: { ...idea, data, cycleBeats, detail: `${data.length} notes` },
    summary:
      idea.type === "melody"
        ? "Lead motif varied; strong notes follow the chords"
        : "Riff varied around the same musical pulse",
  };
}

/** Change active takes only; retain locked tracks, alternate takes, recordings, notes and mix. */
export function varySection(
  project: Project,
  source: SongSection,
  locks: SectionLocks,
  change: SectionChange,
  seed: number,
  direction?: MusicalDirection,
): { section: SongSection; summary: string[] } {
  const context = sectionContext(project, source);
  const active = new Map(
    CREATIVE_LAYERS.map((layer) => [layer, source.ideas.find((idea) => idea.type === layer)]),
  );
  const replacements = new Map<Idea, Idea>();
  const summary: string[] = [];
  const remember = (original: Idea, changed: ChangedIdea) => {
    replacements.set(original, changed.idea);
    summary.push(changed.summary);
  };
  const anchored = (["bass", "melody", "riff"] as const).some(
    (layer) => locks[layer] && active.get(layer)?.data?.length,
  );
  const chordIdea = active.get("chords");
  const drumIdea = active.get("drums");
  if (chordIdea && !locks.chords && readHarmonyData(chordIdea).length)
    remember(chordIdea, varyHarmony(chordIdea, context, anchored, change, seed, direction));
  if (drumIdea && !locks.drums && drumIdea.data?.length)
    remember(drumIdea, varyDrums(drumIdea, context.barLengths[0], change, seed));
  const chordData = readHarmonyData(chordIdea && (replacements.get(chordIdea) ?? chordIdea));
  const drumData = drumIdea ? ((replacements.get(drumIdea) ?? drumIdea).data ?? []) : [];
  const bassIdea = active.get("bass");
  if (bassIdea?.data?.length && !locks.bass) {
    const bass = generateSectionBass(project, source, chordData, drumData, change, seed + 29);
    remember(bassIdea, {
      idea: {
        ...bassIdea,
        data: bass.map(encodeBassNote),
        detail: `${bass.length} notes · follows harmony and kick`,
      },
      summary:
        change === "space"
          ? "Longer bass notes; space for the lead"
          : "Bass follows the harmony and kick",
    });
  }
  for (const layer of ["melody", "riff"] as const) {
    const idea = active.get(layer);
    if (idea?.data?.length && !locks[layer])
      remember(idea, varyLead(idea, context, chordData, change, seed));
  }
  return {
    section: { ...source, ideas: source.ideas.map((idea) => replacements.get(idea) ?? idea) },
    summary: summary.length ? summary : ["All available parts are locked"],
  };
}

function completeFoundation(
  project: Project,
  source: SongSection,
  seed: number,
  newId: () => string,
): SongSection {
  const context = sectionContext(project, source);
  const ideas = [...source.ideas];
  const heavy = ideas.some((idea) => idea.voice === "distorted guitar");
  const soul = ideas.some((idea) => idea.voice === "warm pad");
  const hasPart = (type: Idea["type"]) =>
    ideas.some(
      (idea) => idea.type === type && (idea.data?.length || (type === "chords" && idea.detail)),
    );
  if (!hasPart("chords")) {
    const chords = generateChordProgression({
      root: context.root,
      mode: context.mode,
      bars: 4,
      complexity: heavy ? "simple" : "medium",
      seed,
      tension: "smooth",
      opening: "tonic",
    });
    ideas.unshift({
      id: newId(),
      type: "chords",
      name: "Related harmony",
      detail: chords.map((chord) => chord.name).join(" · "),
      voice: heavy ? "distorted guitar" : "warm pad",
      data: chords.map((chord, index) =>
        encodeChord({
          name: chord.name,
          beats: context.barLengths[index % context.barLengths.length],
          pitches: heavy
            ? heavyPowerVoicing(chord.name)
            : voiceChord(chord.name, seed + index, "open"),
        }),
      ),
    });
  }
  const chordData = readHarmonyData(ideas.find((idea) => idea.type === "chords"));
  if (!hasPart("drums")) {
    const groove = chooseSketchGroove(
      heavy ? "heavy" : soul ? "neo-soul" : "rock",
      context.barLengths[0],
      seed,
    );
    const hits = buildSketchGroove(groove, context.barLengths[0], 1, seed, "balanced", "theme");
    ideas.push({
      id: newId(),
      type: "drums",
      name: groove.name,
      detail: "Related groove",
      voice: heavy ? "prog metal" : soul ? "dry studio" : "roomy rock",
      data: hits.map(
        (hit) => `${hit.instrument}|${hit.step}|${hit.velocity}|${context.barLengths[0]}`,
      ),
    });
  }
  const drumData = ideas.find((idea) => idea.type === "drums" && idea.data?.length)?.data ?? [];
  if (!hasPart("bass")) {
    const bass = generateSectionBass(project, source, chordData, drumData, "subtle", seed);
    ideas.push({
      id: newId(),
      type: "bass",
      name: "Related bass",
      voice: "deep bass",
      detail: "Follows harmony and kick",
      data: bass.map(encodeBassNote),
    });
  }
  if (!hasPart("melody") && !hasPart("riff")) {
    const melody = generateMelody({
      root: context.root,
      mode: context.mode,
      notes: 12,
      seed,
      density: 0.45,
      mood: "calm",
      shape: "hook",
    });
    const cycleBeats = Math.min(context.length, context.barLengths[0] * 4);
    const end = Math.max(0.25, ...melody.map((note) => note.start + note.duration));
    const ratio = cycleBeats / end;
    const harmony = harmonyTimeline(chordData);
    const data = melody.map((note) => {
      const start = Math.round(note.start * ratio * 4) / 4;
      const pitch = harmony.fitPitch(note.pitch, start);
      return `${midiNoteName(pitch)}|${start}|${Math.max(0.125, note.duration * ratio)}|${pitch}`;
    });
    ideas.push({
      id: newId(),
      type: "melody",
      name: "Related motif",
      voice: "air flute",
      cycleBeats,
      detail: "Related motif",
      data,
    });
  }
  return { ...source, ideas };
}

function developIdea(
  idea: Idea,
  sourceLead: Idea | undefined,
  firstBar: number,
  role: SectionRole,
  seed: number,
  newId: () => string,
): Idea {
  let data = idea.data;
  if (idea.type === "chords" && data?.length && (role === "verse" || role === "chorus")) {
    const chords = data.map(decodeRhythmicChord);
    const attacks = generateChordRhythm(chords, {
      seed,
      beatsPerBar: firstBar,
      style: role === "verse" ? "sustain" : "eighths",
    });
    data = chords.map((chord, index) => encodeChord({ ...chord, attacks: attacks[index] }));
  }
  if (idea.type === "melody" && data?.length && sourceLead?.data?.length && role !== "bridge") {
    const opening = sourceLead.data.filter((encoded) => Number(encoded.split("|")[1]) < firstBar);
    data = [...opening, ...data.filter((encoded) => Number(encoded.split("|")[1]) >= firstBar)];
  }
  if (role === "bridge" && idea.type === "chords" && data && data.length > 2)
    data = [...data.slice(2), ...data.slice(0, 2)];
  return { ...idea, id: newId(), data: data ? [...data] : undefined };
}

function refitBridge(section: SongSection): SongSection {
  const harmony = harmonyTimeline(
    readHarmonyData(section.ideas.find((idea) => idea.type === "chords")),
  );
  const ideas = section.ideas.map((idea) => {
    if (!["bass", "melody", "riff"].includes(idea.type) || !idea.data) return idea;
    const data = decodePitchedNotes(idea).map((note) =>
      encodePitchedNote(idea.type, {
        ...note,
        pitch: harmony.fitPitch(note.pitch, note.start, idea.type === "bass"),
      }),
    );
    return { ...idea, data };
  });
  return { ...section, ideas };
}

/** Verse/chorus retain the harmonic sequence and opening motif; bridge refits the final harmony. */
export function developSection(
  project: Project,
  source: SongSection,
  role: SectionRole,
  seed: number,
  newId: () => string,
): SongSection {
  const foundation = completeFoundation(project, source, seed, newId);
  const locks: SectionLocks = { chords: role !== "bridge" };
  const change: SectionChange =
    role === "verse" ? "space" : role === "chorus" ? "energy" : "subtle";
  const varied = varySection(project, foundation, locks, change, seed).section;
  const sourceLead = source.ideas.find((idea) => idea.type === "melody");
  const firstBar = sectionContext(project, source).barLengths[0] ?? 4;
  const section: SongSection = {
    ...varied,
    id: newId(),
    name: role === "return" ? `${source.name} return` : role[0].toUpperCase() + role.slice(1),
    repeats: 1,
    energy: role === "verse" ? "mellow" : role === "chorus" ? "powerful" : "balanced",
    ideas: varied.ideas.map((idea) => developIdea(idea, sourceLead, firstBar, role, seed, newId)),
  };
  return role === "bridge" ? refitBridge(section) : section;
}
