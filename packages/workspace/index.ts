export type Idea = {
  id: string;
  type: "audio" | "chords" | "melody" | "drums" | "bass" | "riff" | "transition" | "text";
  name: string;
  detail: string;
  voice?: string;
  recordingId?: string;
  data?: string[];
};
export type TrackMix = { muted: boolean; solo: boolean; volume: number };
export type SectionMix = Partial<Record<"drums" | "bass" | "chords" | "melody" | "riff", TrackMix>>;
export type SectionEnergy = "mellow" | "balanced" | "powerful";
export type SongSection = { id: string; name: string; bars: number; color: string; ideas: Idea[]; meterMap?: string[]; mix?: SectionMix; repeats?: number; energy?: SectionEnergy };
export type Project = { id: string; name: string; bpm: number; meter: string; key: string; updated: number; sections: SongSection[] };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 10000): v is string => typeof v === "string" && v.length <= max;
const validMix = (value: unknown) => value === undefined || (record(value) && ["drums", "bass", "chords", "melody", "riff"].every(layer => {
  const setting = value[layer];
  return setting === undefined || (record(setting) && typeof setting.muted === "boolean" && typeof setting.solo === "boolean" && typeof setting.volume === "number" && setting.volume >= 0 && setting.volume <= 1);
}));
export function validProjects(value: unknown): value is Project[] {
  return Array.isArray(value) && value.length <= 500 && new Set(value.map(p => record(p) ? p.id : null)).size === value.length && value.every(p =>
    record(p) && str(p.id, 150) && p.id.length > 0 && str(p.name, 500) && str(p.key, 100) && /^\d{1,2}\/(2|4|8|16)$/.test(String(p.meter)) &&
    typeof p.bpm === "number" && p.bpm >= 30 && p.bpm <= 300 && Number.isFinite(p.updated) &&
    Array.isArray(p.sections) && p.sections.length <= 200 && p.sections.every(s => record(s) && str(s.id, 150) && str(s.name, 500) && str(s.color, 100) &&
      typeof s.bars === "number" && s.bars >= 1 && s.bars <= 256 &&
      (s.repeats === undefined || (Number.isInteger(s.repeats) && Number(s.repeats) >= 1 && Number(s.repeats) <= 8)) &&
      (s.energy === undefined || ["mellow", "balanced", "powerful"].includes(String(s.energy))) &&
      (!s.meterMap || (Array.isArray(s.meterMap) && s.meterMap.length <= 256 && s.meterMap.every(m => /^\d{1,2}\/(2|4|8|16)$/.test(String(m))))) &&
      validMix(s.mix) &&
      Array.isArray(s.ideas) && s.ideas.length <= 500 && s.ideas.every(i => record(i) && str(i.id, 150) && str(i.name, 500) && str(i.detail) &&
        ["audio", "chords", "melody", "drums", "bass", "riff", "transition", "text"].includes(String(i.type)) &&
        (i.voice === undefined || ["current", "acoustic studio", "dry studio", "rock", "prog metal", "roomy rock", "dark acoustic", "distorted guitar", "air flute", "warm pad", "glass", "pluck", "analog pulse", "deep bass", "808 bass", "sub bass"].includes(String(i.voice))) &&
        (i.recordingId === undefined || str(i.recordingId, 150)) &&
        (i.data === undefined || (Array.isArray(i.data) && i.data.length <= 10000 && i.data.every(d => str(d, 1000)))))));
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Three-way merge: deletions propagate, but concurrent edits are never discarded. */
export function mergeProjects(base: Project[], local: Project[], remote: Project[], newId: () => string) {
  const b = new Map(base.map(p => [p.id, p]));
  const l = new Map(local.map(p => [p.id, p]));
  const r = new Map(remote.map(p => [p.id, p]));
  const result: Project[] = [];
  for (const id of new Set([...r.keys(), ...l.keys(), ...b.keys()])) {
    const old = b.get(id), mine = l.get(id), theirs = r.get(id);
    if (equal(mine, theirs)) { if (mine) result.push(mine); }
    else if (equal(mine, old)) { if (theirs) result.push(theirs); }
    else if (equal(theirs, old)) { if (mine) result.push(mine); }
    else {
      if (theirs) result.push(theirs);
      if (mine) result.push({ ...mine, id: newId(), name: `${mine.name} (conflict copy)` });
    }
  }
  return result.sort((a, b) => b.updated - a.updated);
}

export function recordingIds(projects: Project[]) {
  return [...new Set(projects.flatMap(p => p.sections.flatMap(s => s.ideas.flatMap(i => i.recordingId ? [i.recordingId] : []))))];
}
