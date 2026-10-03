"use client";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useAudioEngine } from "../audio/use-audio-engine";
import {
  CREATIVE_LAYERS,
  developSection,
  varySection,
  type SectionLocks,
  type SectionRole,
  type SectionChange,
} from "../../packages/workspace/section-development";
import { automaticSectionMix } from "../../packages/workspace/section-mix";
import type { Project, SongSection } from "../../packages/workspace";

type CreativeDialogProps = {
  project: Project;
  source: SongSection;
  close: () => void;
  save: (section: SongSection, asNew: boolean) => void;
  newId: () => string;
  generateSeed: () => number;
  renderPreview: (
    project: Project,
    sectionId: string,
    autoStart: boolean,
    key: string,
  ) => ReactNode;
};

export function SectionCreativeDialog({
  project,
  source,
  close,
  save,
  newId,
  generateSeed,
  renderPreview,
}: CreativeDialogProps) {
  const [locks, setLocks] = useState<SectionLocks>({ chords: true });
  const [candidate, setCandidate] = useState<SongSection | null>(null);
  const [side, setSide] = useState<"A" | "B">("A");
  const [summary, setSummary] = useState<string[]>([]);
  const [role, setRole] = useState<SectionRole | null>(null);
  const [revision, setRevision] = useState(0);
  const [autoAudition, setAutoAudition] = useState(false);
  const auditionEngine = useAudioEngine();
  const dialog = useRef<HTMLElement | null>(null);
  const closeDialog = useEffectEvent(close);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>(".modal-close")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        window.dispatchEvent(new Event("inspitivity-solo-preview"));
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      trigger?.focus();
    };
  }, []);
  const available = CREATIVE_LAYERS.filter((layer) =>
    source.ideas.some(
      (i) => i.type === layer && (i.data?.length || (layer === "chords" && i.detail)),
    ),
  );
  const stop = () => window.dispatchEvent(new Event("inspitivity-solo-preview"));
  const chooseSide = (next: "A" | "B") => {
    stop();
    void auditionEngine.unlock();
    setSide(next);
    setAutoAudition(true);
    setRevision((n) => n + 1);
  };
  const generate = (change: SectionChange) => {
    stop();
    const result = varySection(project, source, locks, change, generateSeed());
    setCandidate(result.section);
    setSummary(result.summary);
    setSide("B");
    setRole(null);
    setRevision((n) => n + 1);
  };
  const develop = (nextRole: SectionRole) => {
    stop();
    const result = developSection(project, source, nextRole, generateSeed(), newId);
    setCandidate({ ...result, mix: automaticSectionMix(result, project) });
    setRole(nextRole);
    setSide("B");
    setRevision((n) => n + 1);
    setSummary([
      nextRole === "bridge"
        ? "Related harmonic contrast; accompaniment follows the new chords"
        : nextRole === "return"
          ? "The original theme returns with a small variation"
          : "Chord progression and opening motif retained",
      nextRole === "verse"
        ? "More space and softer drums"
        : nextRole === "chorus"
          ? "Stronger pulse and fuller bass"
          : "A different perspective on the same material",
    ]);
  };
  const shown = side === "B" && candidate ? candidate : source;
  const dismiss = () => {
    stop();
    close();
  };
  const preview = { ...project, id: `${project.id}/creative-preview`, sections: [shown] };
  return (
    <div className="modal-layer">
      <section
        ref={dialog}
        className="modal section-creative-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-creative-title"
      >
        <button className="modal-close" aria-label="Close section development" onClick={dismiss}>
          ×
        </button>
        <h2 id="section-creative-title">Develop & vary</h2>
        <p data-no-translate>{source.name}</p>
        <fieldset className="creative-locks">
          <legend>Keep these parts</legend>
          {available.map((layer) => (
            <label key={layer}>
              <input
                type="checkbox"
                checked={!!locks[layer]}
                onChange={(e) => setLocks((current) => ({ ...current, [layer]: e.target.checked }))}
              />
              <span>{layer}</span>
            </label>
          ))}
        </fieldset>
        <div className="creative-actions">
          {(
            [
              ["subtle", "New variation"],
              ["space", "More space"],
              ["energy", "More energy"],
            ] as const
          ).map(([change, label]) => (
            <button
              key={change}
              disabled={available.length === 0 || available.every((layer) => locks[layer])}
              onClick={() => generate(change)}
            >
              {label}
            </button>
          ))}
        </div>
        <details className="creative-development">
          <summary>Build a related section</summary>
          <p>These actions develop all parts together. Track locks apply to variations above.</p>
          <div className="creative-actions">
            {(
              [
                ["verse", "Quieter verse"],
                ["chorus", "Stronger chorus"],
                ["bridge", "Contrasting bridge"],
                ["return", "Theme return"],
              ] as const
            ).map(([nextRole, label]) => (
              <button key={nextRole} disabled={!available.length} onClick={() => develop(nextRole)}>
                {label}
              </button>
            ))}
          </div>
        </details>
        {candidate && (
          <>
            <div
              className="creative-comparison"
              role="group"
              aria-label="Compare original and variation"
            >
              <button aria-pressed={side === "A"} onClick={() => chooseSide("A")}>
                A · Original
              </button>
              <button aria-pressed={side === "B"} onClick={() => chooseSide("B")}>
                B · {role ? candidate.name : "Variation"}
              </button>
            </div>
            <ul className="creative-summary" role="status">
              {summary.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </>
        )}
        <div className="creative-preview">
          {renderPreview(preview, shown.id, autoAudition, `${side}/${revision}`)}
        </div>
        <div className="creative-footer">
          <button className="secondary-button" onClick={dismiss}>
            Keep original
          </button>
          <button
            className="primary-button"
            disabled={!candidate || side !== "B"}
            onClick={() => {
              if (candidate) {
                stop();
                save(candidate, !!role);
              }
            }}
          >
            {role ? "Add related section" : "Keep variation"}
          </button>
        </div>
      </section>
    </div>
  );
}
