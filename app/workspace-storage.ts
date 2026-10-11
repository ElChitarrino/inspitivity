"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { mergeProjects, migrateTransitionNotes, recordingIds, validProjects, type Project } from "../packages/workspace";

async function audioDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("inspitivity-audio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
export async function saveRecording(id: string, blob: Blob) {
  const db = await audioDatabase();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function localRecording(id: string) {
  const db = await audioDatabase();
  try { return await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction("recordings", "readonly").objectStore("recordings").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
const audioUrl = (id: string) => `/api/recordings/${encodeURIComponent(id)}`;
export async function getRecording(id: string) {
  const local = await localRecording(id);
  if (local) return local;
  const response = await fetch(audioUrl(id), { cache: "no-store" });
  if (!response.ok) return undefined;
  const blob = await response.blob();
  await saveRecording(id, blob);
  return blob;
}
const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const legacyStorageKey = "inspitivity-projects";
const legacyBaseKey = "inspitivity-cloud-base-v1";
const legacyOwnerKey = "inspitivity-legacy-owner-v1";
export function useCloudProjects(initial: Project[], accountId: string) {
  const accountKey = encodeURIComponent(accountId);
  const storageKey = `inspitivity-projects:${accountKey}`;
  const baseKey = `inspitivity-cloud-base-v1:${accountKey}`;
  const [projects, renderProjects] = useState(initial);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Opening your account…");
  const current = useRef(initial);
  const base = useRef<Project[]>([]);
  const busy = useRef(false);
  const readyRef = useRef(false);
  const mounted = useRef(true);
  const uploaded = useRef(new Set<string>());
  const hadLocal = useRef(false);
  const setProjects = useCallback((action: SetStateAction<Project[]>) => {
    const next = migrateTransitionNotes(typeof action === "function" ? action(current.current) : action);
    if (jsonEqual(next, current.current)) return;
    hadLocal.current = true;
    current.current = next;
    renderProjects(next);
    if (readyRef.current) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); setStatus("Changes kept on this device · syncing…"); }
      catch { setStatus("Device storage is full. Keep this tab open and download a backup."); }
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(() => {
      try {
        const legacyOwner = localStorage.getItem(legacyOwnerKey);
        const canClaimLegacy = !legacyOwner || legacyOwner === accountId;
        const scoped = localStorage.getItem(storageKey);
        const stored = scoped ?? (canClaimLegacy ? localStorage.getItem(legacyStorageKey) : null);
        if (stored) {
          hadLocal.current = true;
          const parsed: unknown = JSON.parse(stored);
          if (!validProjects(parsed)) throw new Error("Invalid device data");
          const migrated = migrateTransitionNotes(parsed);
          current.current = migrated;
          renderProjects(migrated);
          if (!jsonEqual(parsed, migrated)) localStorage.setItem(storageKey, JSON.stringify(migrated));
          if (!scoped) {
            localStorage.setItem(legacyOwnerKey, accountId);
            localStorage.setItem(storageKey, JSON.stringify(migrated));
          }
        }
        const savedBase: unknown = JSON.parse(localStorage.getItem(baseKey) ?? (canClaimLegacy ? localStorage.getItem(legacyBaseKey) : null) ?? "[]");
        if (validProjects(savedBase)) base.current = savedBase;
        readyRef.current = true;
        setReady(true);
      } catch { setStatus("Could not read your device copy. Export or recover it before syncing."); }
    }, 0);
    return () => { mounted.current = false; clearTimeout(timer); };
  }, [accountId, baseKey, storageKey]);
  const sync = useCallback(async () => {
    if (!readyRef.current || busy.current) return;
    if (!navigator.onLine) { setStatus("Offline · changes kept on this device"); return; }
    busy.current = true;
    setStatus("Syncing your ideas…");
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (response.status === 401) { setStatus("Your session expired · sign in again to sync"); return; }
        if (!response.ok) throw new Error("Sync unavailable · device copy kept");
        const remote = await response.json();
        if (!validProjects(remote.projects) || !Number.isInteger(remote.revision)) throw new Error("Unexpected sync response · device copy kept");
        const captured = current.current;
        const local = !hadLocal.current && remote.projects.length ? [] : captured;
        const merged = migrateTransitionNotes(mergeProjects(base.current, local, remote.projects, () => crypto.randomUUID()));
        if (!jsonEqual(merged, remote.projects)) {
          const saved = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: remote.revision, projects: merged }) });
          if (saved.status === 409) continue;
          if (!saved.ok) throw new Error("Could not sync changes · device copy kept");
        }
        if (!mounted.current) return;
        // Preserve edits made while the request was in flight.
        const next = mergeProjects(captured, current.current, merged, () => crypto.randomUUID());
        base.current = merged;
        localStorage.setItem(baseKey, JSON.stringify(merged));
        setProjects(next);
        let missing = 0;
        for (const id of recordingIds(next)) {
          if (uploaded.current.has(id)) continue;
          const head = await fetch(audioUrl(id), { method: "HEAD", cache: "no-store" });
          if (!head.ok) {
            if (head.status !== 404) throw new Error("Recording sync unavailable · local takes kept");
            const blob = await localRecording(id);
            if (!blob) { missing++; continue; }
            const put = await fetch(audioUrl(id), { method: "PUT", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
            if (!put.ok) throw new Error(put.status === 413 ? "A recording exceeds the 25 MB cloud limit · local take kept" : "Recording sync failed · local take kept");
          }
          uploaded.current.add(id);
        }
        if (mounted.current) setStatus(missing ? `Projects synced · ${missing} recording(s) unavailable on this device or cloud` : jsonEqual(current.current, base.current) ? "Synced across your devices" : "New changes waiting to sync…");
        return;
      }
      throw new Error("Another device is editing · retry sync shortly");
    } catch (error) { if (mounted.current) setStatus(error instanceof Error ? error.message : "Offline · device copy kept"); }
    finally { busy.current = false; }
  }, [setProjects]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void sync(), 1200);
    return () => clearTimeout(timer);
  }, [projects, ready, sync]);
  useEffect(() => {
    const run = () => void sync();
    window.addEventListener("online", run);
    window.addEventListener("focus", run);
    const interval = window.setInterval(run, 20000);
    return () => { clearInterval(interval); window.removeEventListener("online", run); window.removeEventListener("focus", run); };
  }, [sync]);
  return [projects, setProjects, { status, sync, ready }] as const;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const asDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
});
export async function downloadBackup(projects: Project[]) {
  const recordings: Record<string, string> = {};
  for (const id of recordingIds(projects)) {
    const blob = await getRecording(id);
    if (!blob) throw new Error(`Recording ${id} is missing. A complete backup could not be created.`);
    recordings[id] = await asDataUrl(blob);
  }
  downloadBlob(new Blob([JSON.stringify({ format: "inspitivity", version: 1, projects, recordings })], { type: "application/json" }), "inspitivity-complete-backup.json");
}
export async function restoreBackup(file: File) {
  if (file.size > 100_000_000) throw new Error("This backup is too large (100 MB maximum).");
  const data = JSON.parse(await file.text());
  const projects: unknown = Array.isArray(data) ? data : data.projects;
  if (!validProjects(projects)) throw new Error("This is not a valid Inspitivity backup.");
  if (!Array.isArray(data) && (data.format !== "inspitivity" || data.version !== 1)) throw new Error("Unsupported backup format.");
  const restoredIds = new Map<string, string>();
  const blobs: Array<[string, Blob]> = [];
  for (const id of recordingIds(projects)) {
    const value = data.recordings?.[id];
    if (!value) { if (!Array.isArray(data)) throw new Error("The backup is missing a recording."); continue; }
    if (typeof value !== "string" || !/^data:audio\/[a-zA-Z0-9.+-]+(?:;[^,]*)?;base64,/.test(value)) throw new Error("Invalid audio in backup.");
    const blob = await (await fetch(value)).blob();
    if (blob.size > 25_000_000) throw new Error("A recording exceeds 25 MB.");
    const nextId = crypto.randomUUID(); restoredIds.set(id, nextId); blobs.push([nextId, blob]);
  }
  for (const [id, blob] of blobs) await saveRecording(id, blob);
  // Always import as copies: restoring can never overwrite existing work.
  return projects.map(p => ({ ...p, id: crypto.randomUUID(), name: `${p.name} (restored)`, updated: Date.now(), sections: p.sections.map(s => ({ ...s, id: crypto.randomUUID(), ideas: s.ideas.map(i => ({ ...i, id: crypto.randomUUID(), recordingId: i.recordingId ? restoredIds.get(i.recordingId) ?? i.recordingId : undefined })) })) }));
}
