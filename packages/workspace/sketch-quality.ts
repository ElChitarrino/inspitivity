import { buildSongPlan } from "./music.js";
import type { Project } from "./index.js";

/** A fast, deterministic comparison of drafts with the same requested feel. */
export function scoreSketch(project: Project): number {
  const { events } = buildSongPlan(project);
  let score = 0;
  for (const section of project.sections) {
    const notes = events.filter(event => event.sectionId === section.id);
    const chords = notes.filter(event => event.layer === "chords");
    const bass = notes.filter(event => event.layer === "bass");
    const drums = notes.filter(event => event.layer === "drums");
    const leads = notes.filter(event => event.layer === "melody" || event.layer === "riff");
    const bars = Math.max(1, section.bars * (section.repeats ?? 1));
    const bassPerBar = bass.length / bars;
    const leadPerBar = leads.length / bars;
    // Musical parts need room to breathe. The target changes with section energy.
    const energy = section.energy === "powerful" ? 1.25 : section.energy === "mellow" ? .7 : 1;
    score -= Math.max(0, bassPerBar - 5 * energy) * .65;
    score -= Math.max(0, leadPerBar - 7 * energy) * .45;
    if (!chords.length || !bass.length || !drums.length) score -= 8;
    const attacks = leads.filter(note => note.layer === "melody" || note.velocity >= .6);
    for (const note of attacks) {
      const harmony = chords.filter(chord => chord.seconds <= note.seconds + .025 && chord.seconds + chord.secondsDuration > note.seconds + .025);
      if (harmony.length && !harmony.some(chord => (chord.pitch - note.pitch + 120) % 12 === 0)) score -= .35;
    }
    const sorted = attacks.slice().sort((a,b) => a.seconds - b.seconds);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i-1], current = sorted[i];
      if (current.layer === previous.layer && current.seconds - previous.seconds < 1.5)
        score -= Math.max(0, Math.abs(current.pitch - previous.pitch) - 12) * .08;
    }
    // Simultaneous riff and melody attacks obscure the hook, especially in quiet sections.
    const melodies = attacks.filter(note => note.layer === "melody");
    const riffs = attacks.filter(note => note.layer === "riff");
    score -= melodies.filter(note => riffs.some(riff => Math.abs(riff.seconds - note.seconds) < .08)).length * .4;
    // A bass note landing with the kick anchors the groove without filling every gap.
    const kicks = drums.filter(note => note.pitch === 36);
    score += Math.min(4, bass.filter(note => kicks.some(kick => Math.abs(kick.seconds - note.seconds) < .08)).length / bars) * .3;
  }
  return score / Math.max(1, project.sections.length);
}

export function chooseSketch<T extends Project>(candidates: T[]): T {
  if (!candidates.length) throw new Error("At least one sketch is required");
  return candidates.reduce((best, candidate) => scoreSketch(candidate) > scoreSketch(best) ? candidate : best);
}
