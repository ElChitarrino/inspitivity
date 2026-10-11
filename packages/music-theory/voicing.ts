import { search } from "@tonaljs/voicing";
import dictionary from "@tonaljs/voicing-dictionary";
import { midi } from "@tonaljs/note";
import { notePitchClass, seededRandom, voiceChord, type VoicingStyle } from "./index.js";

/** Select adjoining chord voicings together so the upper voices move deliberately. */
export function voiceProgression(symbols: string[], seed: number, style: VoicingStyle = "mixed"): number[][] {
  const random = seededRandom(seed);
  let previous: number[] = [];
  return symbols.map((symbol, index) => {
    const bass = notePitchClass(symbol.split("/")[1] ?? symbol);
    const options = search(symbol, ["C3", "E5"], dictionary.all)
      .map(notes => notes.map(midi))
      .filter((notes): notes is number[] => notes.length >= 3 && notes.every((pitch): pitch is number => pitch !== null))
      .map(notes => [...new Set(notes)].sort((a,b) => a-b))
      .filter(notes => notes.length >= 3);
    if (bass === null || !options.length) {
      const fallback = voiceChord(symbol, seed + index * 997, style);
      previous = fallback.slice(1);
      return fallback;
    }
    const ranked = options.map(notes => {
      const spread = notes.at(-1)! - notes[0];
      const movement = previous.length
        ? notes.reduce((sum, pitch) => sum + Math.min(...previous.map(other => Math.abs(other - pitch))), 0) / notes.length
          + Math.abs(notes.at(-1)! - previous.at(-1)!) * .65
        : Math.abs((notes[0] + notes.at(-1)!) / 2 - 62) * .35;
      const styleCost = style === "open" ? Math.max(0, 14 - spread) * .55
        : style === "close" ? Math.max(0, spread - 16) * .5 : 0;
      const lowCost = notes[0] < 52 ? (52 - notes[0]) * .3 : 0;
      return { notes, cost: movement + styleCost + lowCost + random() * 1.5 };
    }).sort((a,b) => a.cost - b.cost);
    previous = ranked[0].notes.slice();
    if (style === "drop 2" && previous.length >= 3) {
      previous[previous.length - 2] -= 12;
      previous.sort((a,b) => a-b);
    }
    return [36 + bass, ...previous];
  });
}
