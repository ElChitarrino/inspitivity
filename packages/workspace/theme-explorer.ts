import { generateChordProgression, getScale, notePitchClass, chordIntervals, seededRandom, type Mode, type Root, type Complexity, type HarmonicTension, type ProgressionOpening, type VoicingStyle } from "../music-theory/index.js";
import { voiceProgression } from "../music-theory/voicing.js";
import { generateChordRhythm, type ChordRhythm } from "../music-theory/chord-rhythm.js";

export const THEME_FEELS = ["wistful", "warm", "bright", "restless", "soulful", "dark"] as const;
export type ThemeFeel = typeof THEME_FEELS[number];

export const THEME_RECIPES: Record<ThemeFeel, {
  title: string; description: string; degrees: readonly number[];
  complexity: Complexity; tension: HarmonicTension; opening: ProgressionOpening;
  voicing: VoicingStyle; color: "violet" | "amber" | "blue" | "coral";
}> = {
  wistful: { title: "A memory in motion", description: "A gentle minor descent that finds its way home.", degrees: [0, 5, 3, 4], complexity: "medium", tension: "smooth", opening: "tonic", voicing: "open", color: "blue" },
  warm: { title: "Late afternoon", description: "Familiar major movement, softened by an open register.", degrees: [0, 4, 3, 4], complexity: "medium", tension: "smooth", opening: "tonic", voicing: "open", color: "amber" },
  bright: { title: "Open road", description: "A lift away from the tonic with a confident return.", degrees: [0, 3, 4, 0], complexity: "simple", tension: "balanced", opening: "tonic", voicing: "mixed", color: "coral" },
  restless: { title: "Unresolved question", description: "A rising phrase with a suspended sense of arrival.", degrees: [0, 1, 4, 5], complexity: "advanced", tension: "bold", opening: "tonic", voicing: "close", color: "violet" },
  soulful: { title: "After hours", description: "Sevenths and ninths move through a relaxed, intimate arc.", degrees: [1, 4, 0, 5], complexity: "advanced", tension: "balanced", opening: "away", voicing: "drop 2", color: "violet" },
  dark: { title: "Low light", description: "Minor harmony gathers tension before a strong return.", degrees: [0, 5, 3, 4], complexity: "simple", tension: "bold", opening: "tonic", voicing: "close", color: "blue" },
};

const HINTS: Record<ThemeFeel, RegExp> = {
  wistful: /nostalg|memory|memories|longing|melanch|sad|bittersweet|goodbye|farewell|heartbreak|sehnsucht|wehm[üu]tig|traurig|vermiss|abschied/i,
  warm: /warm|gentle|cozy|tender|soft|peace|sunset|calm|sanft|ruhig|geborgen|zart/i,
  bright: /bright|hope|joy|happy|uplift|sunny|celebrat|hell|freud|fr[öo]hlich|hoffnung/i,
  restless: /tense|uncertain|anxious|restless|nervous|urgent|frantic|unruhig|spannung|nerv[öo]s/i,
  soulful: /soul|jazz|funk|intimate|velvet|late night|smooth|romantic|neo.soul|nacht|romant/i,
  dark: /dark|heavy|hard|angry|gritty|ominous|menac|djent|metal|d[üu]ster|hart|w[üu]tend/i,
};

export function explicitThemeFeel(prompt: string): ThemeFeel | null {
  const matches = THEME_FEELS.map(feel => ({ feel, index: prompt.search(HINTS[feel]) })).filter(match => match.index >= 0);
  return matches.sort((a, b) => a.index - b.index)[0]?.feel ?? null;
}

export function inferThemeFeel(prompt: string): ThemeFeel {
  return explicitThemeFeel(prompt) ?? "warm";
}

export function parseModelFeel(answer: string): ThemeFeel | null {
  const normalized = answer.trim().toLowerCase();
  // Reject echoed lists or mixed categories. Small models sometimes choose a
  // synonym despite the constrained instruction, so normalize unambiguous ones.
  const mentions = [...new Set(normalized.match(/\b(?:wistful|warm|bright|restless|soulful|dark)\b/g))];
  if(mentions.length) return mentions.length === 1 ? mentions[0] as ThemeFeel : null;
  const synonyms: Record<ThemeFeel,RegExp> = {
    wistful:/\b(sentimental|nostalgic|melancholic|melancholy|sad|sorrowful|longing)\b/,
    warm:/\b(comforting|cozy|peaceful|tender|gentle|calm)\b/,
    bright:/\b(joyful|happy|hopeful|optimistic|cheerful|uplifting)\b/,
    restless:/\b(anxious|tense|urgent|unsettled|nervous)\b/,
    soulful:/\b(jazzy|romantic|intimate|smooth)\b/,
    dark:/\b(angry|menacing|ominous|aggressive|threatening|heavy)\b/,
  };
  const matches=THEME_FEELS.filter(feel=>synonyms[feel].test(normalized));
  return matches.length===1?matches[0]:null;
}

// Phrase-level choices, not independently randomized chords. Each arc has a
// destination; seed variation changes the arc, extensions, register and rhythm.
export const THEME_ARCS: Record<ThemeFeel, readonly (readonly number[])[]> = {
  warm: [[0,5,1,4],[0,2,3,0],[0,3,1,4],[5,3,0,4],[0,4,5,3],[3,1,4,0]],
  wistful: [[0,5,2,6],[0,6,5,4],[0,3,6,0],[5,6,0,0],[0,2,3,4],[0,5,3,6]],
  bright: [[0,3,4,0],[0,4,5,3],[3,4,0,0],[0,1,3,4],[0,2,3,0],[5,3,4,0]],
  restless: [[0,1,4,5],[1,4,2,5],[0,3,1,4],[2,5,1,4],[0,6,1,4],[3,2,1,4]],
  soulful: [[1,4,0,5],[0,5,1,4],[2,5,1,4],[3,2,1,0],[0,3,1,4],[5,1,4,0]],
  dark: [[0,1,0,6],[0,5,3,4],[0,6,5,6],[0,3,1,0],[0,2,1,0],[5,6,0,0]],
};
const FEEL_MODES: Record<ThemeFeel, Mode[]> = {
  warm:["ionian","mixolydian"], wistful:["aeolian","dorian"],
  bright:["ionian","lydian","mixolydian"], restless:["dorian","harmonic minor"],
  soulful:["dorian","ionian","melodic minor"], dark:["aeolian","phrygian","harmonic minor"],
};
const EXPLORER_ROOTS: Root[] = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
export type ExplorerOptions = { prompt: string; seed: number; feel?: ThemeFeel; root?: Root; mode?: Mode; rhythm?: ChordRhythm; voicing?: VoicingStyle };
export function generateThemeDraft(options: ExplorerOptions) {
  const feel = options.feel ?? inferThemeFeel(options.prompt);
  const recipe = THEME_RECIPES[feel];
  const random = seededRandom(options.seed);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random()*items.length)];
  const root = options.root ?? pick(EXPLORER_ROOTS);
  const mode = options.mode ?? pick(FEEL_MODES[feel]);
  const arcIndex = ((options.seed % THEME_ARCS[feel].length) + THEME_ARCS[feel].length) % THEME_ARCS[feel].length;
  const degrees = THEME_ARCS[feel][arcIndex];
  const voicing = options.voicing ?? pick([recipe.voicing, "open", "close", "drop 2"] as const);
  const rhythm = options.rhythm ?? (feel === "soulful" ? "syncopated" : feel === "dark" ? "driving" : "sustain");
  const progression = generateChordProgression({root,mode,bars:4,seed:options.seed,complexity:recipe.complexity,tension:recipe.tension,degreePattern:degrees});
  const voiced = voiceProgression(progression.map(chord=>chord.name), options.seed, voicing);
  const harmonicMode = mode === "minor pentatonic" ? "aeolian" : mode === "major pentatonic" ? "ionian" : mode;
  const scale = new Set(getScale(root,harmonicMode).map(notePitchClass));
  const chords = progression.map((chord,index)=>{
    const tones = new Set(chordIntervals(chord.name).map(interval=>(chord.pitch+interval)%12));
    const pitches = voiced[index].filter(pitch=>scale.has(pitch%12)&&tones.has(pitch%12));
    // Voicing dictionaries sometimes add optional tensions; keep notes faithful
    // to both the displayed chord symbol and the selected harmonic scale.
    for (const tone of tones) if (!pitches.some(pitch=>pitch%12===tone)&&scale.has(tone)) pitches.push(60+tone);
    return {id:`explorer-${options.seed}-${index}`, name:chord.name, beats:4, pitches:[...new Set(pitches)].sort((a,b)=>a-b)};
  });
  const attacks = generateChordRhythm(chords,{seed:options.seed,style:rhythm,beatsPerBar:4});
  return {feel,root,mode,voicing,rhythm,arcIndex,seed:options.seed,chords:chords.map((chord,index)=>({...chord,attacks:attacks[index]}))};
}
