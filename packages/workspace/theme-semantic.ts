import { THEME_FEELS, type ThemeFeel } from "./theme-explorer.js";

export const THEME_DESCRIPTIONS: Record<ThemeFeel, string> = {
  wistful: "A nostalgic, melancholy song about missing someone, memories, longing and a bittersweet farewell.",
  warm: "A gentle, calm and comforting song. A cozy evening, tenderness, peace, safety and a warm sunset.",
  bright: "A joyful, optimistic and uplifting song. Hope, celebration, happiness, sunshine and a fresh beginning.",
  restless: "A tense, unsettled and urgent song. Anxiety, nervous anticipation, uncertainty and restless motion.",
  soulful: "An intimate, romantic late-night song with soulful jazz, smooth neo-soul and a relaxed funky groove.",
  dark: "An aggressive, heavy and ominous song. Angry distorted metal riffs, menace, grit and a threatening storm.",
};

export function matchThemeEmbedding(vector: readonly number[], prototypes: Record<ThemeFeel, readonly number[]>): ThemeFeel | null {
  if (!vector.length || vector.some(value=>!Number.isFinite(value))) return null;
  const scores=THEME_FEELS.map(feel=>{
    const prototype=prototypes[feel];
    if(prototype.length!==vector.length || prototype.some(value=>!Number.isFinite(value))) return {feel,score:-Infinity};
    const norm=Math.sqrt(vector.reduce((sum,value)=>sum+value*value,0)*prototype.reduce((sum,value)=>sum+value*value,0));
    return {feel,score:norm ? vector.reduce((sum,value,index)=>sum+value*prototype[index],0)/norm : -Infinity};
  }).sort((a,b)=>b.score-a.score);
  // Similarity is a relative match, not an emotion probability. Ambiguous or
  // unrelated descriptions preserve the existing rule-based musical result.
  return scores[0].score>=0.2 && scores[0].score-scores[1].score>=0.015 ? scores[0].feel : null;
}
