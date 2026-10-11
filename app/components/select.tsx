import { canonicalMode, MODE_LABELS, type Mode } from "../../packages/music-theory";
import { DRUM_KIT_LABELS, type DrumKit } from "../../packages/sequencing/drum-samples";
import { CHORD_RHYTHM_LABELS, type ChordRhythm } from "../../packages/music-theory/chord-rhythm";

function optionLabel(label: string, value: string): string {
  if (value === "auto") return "Auto";
  if (label === "Drum kit") return DRUM_KIT_LABELS[value as DrumKit] ?? value;
  if (label === "Strum rhythm") return CHORD_RHYTHM_LABELS[value as ChordRhythm] ?? value;
  if (value === "acoustic guitar") return "Classical guitar · recorded";
  return MODE_LABELS[value as Mode] ?? value;
}

export function Select({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="select-control">
      <span>{label}</span>
      <select
        value={options.includes("ionian") ? canonicalMode(value) : value}
        onChange={(e) => set(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabel(label, o)}
          </option>
        ))}
      </select>
    </label>
  );
}
