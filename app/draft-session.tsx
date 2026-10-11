"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type SetStateAction } from "react";

type Values = Record<string, unknown>;
export type DraftPreview = { type: "chords" | "melody" | "drums" | "bass" | "riff"; data: string[]; voice?: string };
type DraftContextValue = { values: Values; ready: boolean; saved: boolean; set: (key: string, value: SetStateAction<unknown>) => void; register: (key: string, value: unknown) => void; publish: (preview: DraftPreview) => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; error: boolean };
const DraftContext = createContext<DraftContextValue | null>(null);
export function DraftSession({ id, children, publish }: { id: string; children: ReactNode; publish: (preview: DraftPreview) => void }) {
  const [values, setValues] = useState<Values>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedSignature = useRef("");
  const [availability, setAvailability] = useState({ undo:false, redo:false });
  const current = useRef<Values>({}), past = useRef<Values[]>([]), future = useRef<Values[]>([]);
  const defaults = useRef<Values>({});
  const batch = useRef(false);
  const key = `inspitivity-draft-v1:${id}`;
  const persist = useCallback((next: Values) => {
    current.current = next; setValues(next);
    setSaved(savedSignature.current === JSON.stringify(next));
    setAvailability({ undo:past.current.length>0, redo:future.current.length>0 });
    try { localStorage.setItem(key, JSON.stringify({ values: next, savedSignature:savedSignature.current, past: past.current.slice(-30), future: future.current.slice(-30) })); setError(false); }
    catch { setError(true); }
  }, [key]);
  useEffect(() => {
    const timer = setTimeout(() => {
      let restored: Values = {};
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null");
        if (saved?.values && typeof saved.values === "object" && !Array.isArray(saved.values)) {
          restored = saved.values;
          savedSignature.current = typeof saved.savedSignature === "string" ? saved.savedSignature : "";
          past.current = Array.isArray(saved.past) ? saved.past.slice(-30) : [];
          future.current = Array.isArray(saved.future) ? saved.future.slice(-30) : [];
        }
      } catch { setError(true); }
      current.current = { ...defaults.current, ...restored };
      setAvailability({ undo:past.current.length>0, redo:future.current.length>0 });
      setValues(current.current); setReady(true);
      setSaved(savedSignature.current === JSON.stringify(current.current));
    }, 0);
    return () => clearTimeout(timer);
  }, [key]);
  useEffect(() => {
    const markSaved = () => { savedSignature.current = JSON.stringify(current.current); persist(current.current); };
    window.addEventListener("inspitivity-draft-saved",markSaved);
    return () => window.removeEventListener("inspitivity-draft-saved",markSaved);
  }, [persist]);
  const register = useCallback((name: string, value: unknown) => { defaults.current[name] = value; }, []);
  const set = useCallback((name: string, action: SetStateAction<unknown>) => {
    const previous = current.current[name] ?? defaults.current[name];
    const value = typeof action === "function" ? action(previous) : action;
    if (JSON.stringify(previous) === JSON.stringify(value)) return;
    // Multiple setters from one interaction form one undo step.
    if (!batch.current) {
      past.current = [...past.current.slice(-29), { ...defaults.current, ...current.current }];
      future.current = []; batch.current = true;
      queueMicrotask(() => { batch.current = false; });
    }
    persist({ ...defaults.current, ...current.current, [name]: value });
  }, [persist]);
  const undo = useCallback(() => {
    const previous = past.current.pop(); if (!previous) return;
    future.current.push(current.current); persist(previous);
  }, [persist]);
  const redo = useCallback(() => {
    const next = future.current.pop(); if (!next) return;
    past.current.push(current.current); persist(next);
  }, [persist]);
  return <DraftContext.Provider value={{ values, ready, saved, set, register, publish, undo, redo, canUndo: availability.undo, canRedo: availability.redo, error }}>{children}</DraftContext.Provider>;
}
export function useDraftState<T>(name: string, initial: T | (() => T)): [T, (value: SetStateAction<T>) => void] {
  const context = useContext(DraftContext);
  if (!context) throw new Error("DraftSession required");
  const [fallback] = useState(initial);
  const { register, set, values } = context;
  useEffect(() => register(name, fallback), [register, name, fallback]);
  const update = useCallback((action: SetStateAction<T>) => set(name, action as SetStateAction<unknown>), [set, name]);
  return [Object.hasOwn(values, name) ? values[name] as T : fallback, update];
}
export function useDraftPreview(preview: DraftPreview) {
  const context = useContext(DraftContext);
  const serialized = JSON.stringify(preview);
  const publish = context?.publish, ready = context?.ready;
  useEffect(() => { if (ready && publish) publish(JSON.parse(serialized)); }, [serialized, publish, ready]);
}
export function DraftToolbar() {
  const context = useContext(DraftContext);
  if (!context) return null;
  return <div className="draft-toolbar">
    <span role="status">{context.error ? "Draft storage full · save to a section now" : context.saved ? "Saved to your song · draft recovery is up to date" : "Unsaved to song · draft kept on this device"}</span>
    <div className="draft-history" role="group" aria-label="Draft history">
      <button aria-label="Undo" title="Undo" disabled={!context.canUndo} onClick={context.undo}><span aria-hidden="true">↶</span><span className="history-label">Undo</span></button>
      <button aria-label="Redo" title="Redo" disabled={!context.canRedo} onClick={context.redo}><span aria-hidden="true">↷</span><span className="history-label">Redo</span></button>
    </div>
  </div>;
}
