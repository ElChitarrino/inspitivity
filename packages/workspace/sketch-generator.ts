import {
  generateChordProgression,
  generateMelody,
  notePitchClass,
  seededRandom,
  type VoicingStyle,
} from "../music-theory/index.js";
import { voiceProgression } from "../music-theory/voicing.js";
import { generateChordRhythm, type RhythmicChord } from "../music-theory/chord-rhythm.js";
import { generateProgRiff, meterBeats } from "../prog/index.js";
import type { SynthVoice, BassVoice } from "../sequencing/voice-types.js";
import type { DrumKit } from "../sequencing/drum-samples.js";
import type { GrooveEnergy } from "../sequencing/index.js";
import type { Project, SongSection, Idea } from "./index.js";
import { buildSketchGroove, heavyPowerVoicing, shapeSketchMotif } from "./sketch-grammar.js";
import { grooveNotes } from "./sketch-library.js";
import { createSketchPlan, sketchSectionRhythm } from "./sketch-plan.js";
import { SKETCH_FORMS, type SketchPreset, type SketchOptions } from "./sketch-presets.js";
import { MUSICAL_DIRECTIONS } from "./directions.js";
import { encodeChord, encodeBassNote, midiNoteName } from "./idea-codecs.js";
import { generateBassPhrase } from "./bass.js";
import { fitMelodyToChords } from "./lead-harmony.js";
import { phraseLead } from "./lead-phrasing.js";
import { alignPhrase } from "./sketch.js";
import { automaticSectionMix } from "./section-mix.js";

export function buildPlayableSketch(
  preset: SketchPreset,
  options: SketchOptions,
  seed = Date.now(),
  uid = () => crypto.randomUUID(),
): Project {
  const random = seededRandom(seed);
  const pick = <T>(values: T[]) => values[Math.floor(random() * values.length)];
  const root = options.root,
    mode = options.mode,
    meter = options.meter,
    bpm = Math.max(30, Math.min(260, Math.round(options.bpm)));
  const beatsPerBar = meterBeats(meter);
  const preferredForms = SKETCH_FORMS[preset.id].filter((candidate) =>
    options.extendedForm ? candidate.length >= 5 : candidate.length <= 4,
  );
  const form = pick(preferredForms.length ? preferredForms : SKETCH_FORMS[preset.id]);
  type SketchRelation = "theme" | "develop" | "contrast" | "return";
  const relationFor = (name: string, index: number): SketchRelation => {
    if (index === 0) return "theme";
    if (
      /return|outro|coda|tag|resolve|final/i.test(name) ||
      form.slice(0, index).some((section) => section.name === name)
    )
      return "return";
    if (/contrast|break|clean|interlude|half-time|release|drop/i.test(name)) return "contrast";
    if (index === form.length - 1) return "return";
    return "develop";
  };
  const themeCount = 4;
  const feeling = options.direction ? MUSICAL_DIRECTIONS[options.direction] : undefined;
  const plan = createSketchPlan(preset.id, mode, meter, seed, options.direction, options.intensity);
  const harmonicTheme = plan.harmony,
    harmonicContrast = plan.contrastHarmony,
    pocket = plan.groove;
  const buildHarmony = (
    pattern: typeof harmonicTheme,
    chordSeed: number,
    voicing: VoicingStyle,
    support: number[] = [],
  ): RhythmicChord[] => {
    const progression = generateChordProgression({
      root,
      mode,
      bars: themeCount,
      complexity: plan.complexity,
      seed: chordSeed,
      opening: preset.opening,
      tension: feeling?.tension ?? preset.tension,
      preferredPitchClasses: support,
      degreePattern: pattern.degrees,
    });
    const pitches = voiceProgression(
      progression.map((chord) => chord.name),
      chordSeed,
      voicing,
    );
    return progression.map((chord, index) => ({
      name: chord.name,
      beats: plan.chordBeats[index],
      pitches: pitches[index],
    }));
  };
  const themeChords = buildHarmony(harmonicTheme, seed, preset.id === "emotive" ? "open" : "mixed");
  const themePitchClasses = themeChords
    .map((chord) => notePitchClass(chord.name))
    .filter((pitch): pitch is number => pitch !== null);
  const coreMotif = fitMelodyToChords(
    shapeSketchMotif(
      alignPhrase(
        generateMelody({
          root,
          mode,
          notes: feeling ? Math.round(8 + feeling.density * 10) : preset.id === "emotive" ? 12 : 16,
          density: feeling?.density ?? (preset.id === "emotive" ? 0.42 : 0.58),
          mood: feeling?.mood ?? preset.mood,
          seed: seed + 7,
          shape: preset.id === "heavy" ? "hook" : preset.id === "emotive" ? "floating" : "answer",
        }),
        themeCount * beatsPerBar,
      ),
      preset.id,
      beatsPerBar,
      seed + 7,
    ),
    themeChords,
  );
  const coreRiff = options.includePattern
    ? fitMelodyToChords(
        alignPhrase(
          generateProgRiff({
            root,
            mode,
            beats: beatsPerBar * themeCount,
            cycle: preset.id === "heavy" ? 7 : 5,
            grouping: preset.id === "heavy" ? "3+2+2" : "3+3+2",
            density: preset.id === "heavy" ? 0.72 : 0.48,
            seed: seed + 23,
            startOffset: preset.id === "heavy" ? 0.25 : 0.5,
            motion: preset.id === "heavy" ? "anchor" : "orbit",
          }).map((note) => ({
            ...note,
            note: midiNoteName(note.pitch),
            velocity: note.accent ? 0.8 : 0.62,
          })),
          beatsPerBar * themeCount,
        ),
        themeChords,
      )
    : [];
  const hard = options.intensity === "hard",
    mellow = options.intensity === "mellow";
  const chordVoice: SynthVoice = hard
    ? "distorted guitar"
    : mellow
      ? "acoustic guitar"
      : preset.id === "emotive"
        ? "acoustic guitar"
        : preset.id === "neo-soul" || preset.id === "prog"
          ? "warm pad"
          : preset.id === "funk"
            ? "acoustic guitar"
            : preset.id === "rock"
              ? "distorted guitar"
              : "glass";
  const melodyVoice: SynthVoice = hard
    ? "pluck"
    : mellow
      ? "air flute"
      : preset.id === "neo-soul" || preset.id === "prog"
        ? "acoustic guitar"
        : "air flute";
  const patternVoice: SynthVoice = hard
    ? "distorted guitar"
    : preset.id === "prog"
      ? "analog pulse"
      : "pluck";
  const drumVoice: DrumKit =
    preset.id === "heavy" || preset.id === "prog"
      ? hard
        ? "prog metal"
        : "rock"
      : preset.id === "rock"
        ? hard
          ? "rock"
          : "roomy rock"
        : preset.id === "emotive"
          ? mellow
            ? "dark acoustic"
            : "acoustic studio"
          : "dry studio";
  const bassVoice: BassVoice = "deep bass";
  const mainBars = options.extendedForm ? pick([4, 8]) : 4;
  const sections = form.map((formSection, sectionIndex): SongSection => {
    const sectionSeed = seed + sectionIndex * 17;
    const finalSection = sectionIndex === form.length - 1;
    const relation = relationFor(formSection.name, sectionIndex);
    const bars =
      relation === "theme" || (/outro|coda|tag/i.test(formSection.name) && finalSection)
        ? Math.min(4, mainBars)
        : mainBars;
    const density = Math.max(
      0.2,
      Math.min(
        0.95,
        formSection.energy +
          (hard ? 0.13 : mellow ? -0.15 : 0) +
          (feeling ? (feeling.density - 0.53) * 0.7 : 0),
      ),
    );
    const voicing: VoicingStyle =
      relation === "return" ? "open" : relation === "contrast" ? "drop 2" : "mixed";
    const returnVoicings = voiceProgression(
      themeChords.map((chord) => chord.name),
      sectionSeed,
      voicing,
    );
    const sourceChords =
      relation === "contrast"
        ? buildHarmony(harmonicContrast, seed + 101, voicing, themePitchClasses)
        : themeChords.map((chord, index) => ({ ...chord, pitches: returnVoicings[index] }));
    const rhythmStyle = sketchSectionRhythm(plan, relation);
    const sectionEnergy: GrooveEnergy =
      options.direction === "mellow"
        ? "mellow"
        : options.direction === "driving" && !mellow
          ? "powerful"
          : mellow
            ? "mellow"
            : hard
              ? density > 0.6
                ? "powerful"
                : "balanced"
              : formSection.energy < 0.43
                ? "mellow"
                : formSection.energy > 0.72
                  ? "powerful"
                  : "balanced";
    const drums = buildSketchGroove(
      pocket,
      beatsPerBar,
      bars,
      relation === "return" ? seed + 13 : sectionSeed + 13,
      sectionEnergy,
      relation,
    );
    const voicedChords =
      chordVoice === "distorted guitar"
        ? sourceChords.map((chord) => ({ ...chord, pitches: heavyPowerVoicing(chord.name) }))
        : sourceChords;
    const attacks = generateChordRhythm(voicedChords, {
      seed: relation === "return" ? seed : sectionSeed,
      style: rhythmStyle,
      beatsPerBar,
      kickSteps: drums.filter((hit) => hit.instrument === "kick").map((hit) => hit.step),
      snareSteps: drums.filter((hit) => hit.instrument === "snare").map((hit) => hit.step),
    });
    let chordCursor = 0;
    const chords = voicedChords.map((chord, index) => {
      const swung = grooveNotes(attacks[index], pocket, beatsPerBar, chordCursor);
      chordCursor += chord.beats;
      return { ...chord, attacks: swung };
    });
    const motifSource =
      relation === "contrast"
        ? shapeSketchMotif(
            alignPhrase(
              generateMelody({
                root,
                mode,
                notes: Math.max(8, Math.round(12 * density)),
                density: Math.min(0.65, density),
                mood: feeling?.mood ?? preset.mood,
                seed: seed + 107,
                shape: "answer",
              }),
              themeCount * beatsPerBar,
            ),
            preset.id,
            beatsPerBar,
            seed + 107,
          )
        : coreMotif;
    const melody = phraseLead(
      fitMelodyToChords(motifSource, chords),
      beatsPerBar,
      themeCount * beatsPerBar,
    ).map((note) => ({
      ...note,
      velocity: Math.max(0.35, Math.min(0.85, note.velocity * (0.8 + density * 0.25))),
    }));
    const riffLeads =
      options.includePattern &&
      sectionIndex > 0 &&
      (hard || (!mellow && formSection.energy >= 0.45)) &&
      (relation !== "return" || preset.id === "heavy");
    const riff = riffLeads ? fitMelodyToChords(coreRiff, chords) : [];
    const ideas: Idea[] = [
      {
        id: uid(),
        type: "chords",
        name: `${formSection.name} · ${relation === "contrast" ? harmonicContrast.name : harmonicTheme.name}`,
        voice: chordVoice,
        detail: chords.map((chord) => chord.name).join(" · "),
        data: chords.map(encodeChord),
      },
      {
        id: uid(),
        type: "drums",
        name: `${formSection.name} · ${pocket.name}`,
        voice: drumVoice,
        detail: `${drums.length} hits · ${meter}`,
        data: drums.map(
          (hit) => `${hit.instrument}|${hit.step}|${hit.velocity}|${beatsPerBar * bars}`,
        ),
      },
    ];
    if (options.includeMelody && !riffLeads)
      ideas.splice(1, 0, {
        id: uid(),
        type: "melody",
        name: `${formSection.name} motif`,
        voice: melodyVoice,
        detail: melody.map((note) => note.note).join(" · "),
        cycleBeats: themeCount * beatsPerBar,
        data: melody.map(
          (note) => `${note.note}|${note.start}|${note.duration}|${note.pitch}|${note.velocity}`,
        ),
      });
    if (riff.length)
      ideas.push({
        id: uid(),
        type: "riff",
        name: `${formSection.name} pulse`,
        voice: patternVoice,
        detail: `${riff.length} notes · ${meter}`,
        data: riff.map(
          (note) =>
            `${note.pitch}|${note.start}|${note.duration}|${note.accent ? 1 : 0}|${note.muted ? 1 : 0}`,
        ),
      });
    const section: SongSection = {
      id: uid(),
      name: formSection.name,
      bars,
      color: formSection.color,
      ideas,
      meterMap: Array.from({ length: bars }, () => meter),
      energy: sectionEnergy,
    };
    const sketchContext: Project = {
      id: "preview",
      name: preset.label,
      bpm,
      meter,
      key: `${root} ${mode}`,
      updated: 0,
      sections: [section],
    };
    const bass = generateBassPhrase({
      root,
      mode,
      length: bars * beatsPerBar,
      meter,
      meterMap: section.meterMap,
      harmony: chords.map((chord) => ({ symbol: chord.name, beats: chord.beats })),
      direction: plan.bassDirection,
      movement:
        hard || riff.length
          ? "rooted"
          : preset.id === "neo-soul" || preset.id === "prog" || preset.id === "funk"
            ? "melodic"
            : "supportive",
      lockToKick: true,
      kickStarts: pocket.kick
        .map((step) => (step * beatsPerBar) / pocket.sourceSteps)
        .flatMap((beat) => Array.from({ length: bars }, (_, bar) => bar * beatsPerBar + beat)),
      kickCycle: bars * beatsPerBar,
      seed: relation === "return" ? seed + 29 : sectionSeed + 29,
      density: 0.35 + density * 0.45,
      repeatRhythm: true,
      otherActivity: (melody.length + riff.length) / Math.max(1, bars * beatsPerBar),
    });
    ideas.push({
      id: uid(),
      type: "bass",
      name: `${formSection.name} bass`,
      detail: `${bass.length} notes · follows harmony and kick`,
      data: grooveNotes(bass, pocket, beatsPerBar).map(encodeBassNote),
      voice: bassVoice,
    });
    if (sectionIndex === 0 && options.brief?.trim())
      ideas.push({ id: uid(), type: "text", name: "Song brief", detail: options.brief.trim() });
    section.mix = automaticSectionMix(section, sketchContext);
    return section;
  });
  return {
    id: uid(),
    name: `${preset.label} sketch`,
    bpm,
    meter,
    key: `${root} ${mode}`,
    updated: Date.now(),
    sections,
  };
}
