import { buildSongPlan, type SongLayer } from "./music.js";
import { activityGain } from "./mix-activity.js";
import type { SongSection, Project, TrackMix, SectionEnergy } from "./index.js";

export const LAYER_LABELS = [
  ["drums", "Drums"],
  ["bass", "Bass"],
  ["chords", "Chords"],
  ["melody", "Melody"],
  ["riff", "Pattern"],
] as const satisfies readonly (readonly [SongLayer, string])[];
export const DEFAULT_SECTION_MIX: Record<SongLayer, TrackMix> = {
  drums: { muted: false, solo: false, volume: 0.82 },
  bass: { muted: false, solo: false, volume: 0.74 },
  chords: { muted: false, solo: false, volume: 0.58 },
  melody: { muted: false, solo: false, volume: 0.72 },
  riff: { muted: false, solo: false, volume: 0.54 },
};
export const sectionMix = (section?: SongSection): Record<SongLayer, TrackMix> =>
  Object.fromEntries(
    LAYER_LABELS.map(([layer]) => [
      layer,
      { ...DEFAULT_SECTION_MIX[layer], ...section?.mix?.[layer] },
    ]),
  ) as Record<SongLayer, TrackMix>;

const ENERGY_LEVELS: Partial<Record<SectionEnergy, readonly [number, number, number]>> = {
  sparse: [0.55, 0.7, 0.66],
  mellow: [0.7, 0.68, 0.62],
  driving: [0.86, 0.78, 0.54],
  powerful: [0.9, 0.8, 0.52],
};

/** Recompute levels from musical activity; sectionMix reads saved user settings. */
export function automaticSectionMix(
  section: SongSection,
  context?: Project,
): Record<SongLayer, TrackMix> {
  const present = new Set(section.ideas.map((idea) => idea.type));
  const energy = section.energy ?? "balanced";
  const mix = sectionMix();
  const energyLevels = ENERGY_LEVELS[energy];
  if (energyLevels) {
    [mix.drums.volume, mix.bass.volume, mix.chords.volume] = energyLevels;
  }
  if (present.has("chords") && present.has("riff")) {
    mix.chords.volume -= 0.08;
    mix.riff.volume -= 0.05;
  }
  if (present.has("melody")) mix.melody.volume = energy === "powerful" ? 0.68 : 0.74;
  if (context) {
    const plan = buildSongPlan({ ...context, sections: [{ ...section, repeats: 1 }] });
    for (const [layer] of LAYER_LABELS) {
      const gain = activityGain(plan.events, plan.seconds, layer);
      mix[layer].volume = Number((mix[layer].volume * gain).toFixed(2));
    }
  }
  return mix;
}
