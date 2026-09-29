import type { Complexity, HarmonicTension, ProgressionOpening, VoicingStyle } from "../music-theory/index.js";

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
  wistful: /nostalg|memory|memories|longing|melanch|sad|bittersweet|sehnsucht|wehm[üu]tig|traurig|vermiss/i,
  warm: /warm|gentle|cozy|tender|soft|peace|sunset|calm|sanft|ruhig|geborgen|zart/i,
  bright: /bright|hope|joy|happy|uplift|sunny|celebrat|hell|freud|fr[öo]hlich|hoffnung/i,
  restless: /tense|uncertain|anxious|restless|nervous|urgent|frantic|unruhig|spannung|nerv[öo]s/i,
  soulful: /soul|jazz|funk|intimate|velvet|late night|smooth|romantic|neo.soul|nacht|romant/i,
  dark: /dark|heavy|hard|angry|gritty|ominous|menac|djent|metal|d[üu]ster|hart|w[üu]tend/i,
};

export function inferThemeFeel(prompt: string): ThemeFeel {
  const matches = THEME_FEELS.map(feel => ({ feel, index: prompt.search(HINTS[feel]) })).filter(match => match.index >= 0);
  return matches.sort((a, b) => a.index - b.index)[0]?.feel ?? "warm";
}

export function parseModelFeel(answer: string): ThemeFeel | null {
  const normalized = answer.trim().toLowerCase();
  // The model may echo the list in its prompt. Only accept a single category at the start.
  const first = normalized.match(/^(?:feel\s*[:=]\s*|["'`\s]*)?(wistful|warm|bright|restless|soulful|dark)[.!"'`\s]*$/);
  return first ? first[1] as ThemeFeel : null;
}
