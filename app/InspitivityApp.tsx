"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chordIntervals, Complexity, generateChordProgression, generateMelody, MelodyMood, Mode, notePitchClass, Root } from "../packages/music-theory";
import { beatDurationSeconds, calculateTapTempo, isAccentedStep, melodyLoopDurationMs, progressionLoopDurationMs, subdivisionDurationSeconds } from "../packages/sequencing";

type Idea = { id: string; type: "audio" | "chords" | "melody" | "text"; name: string; detail: string; recordingId?: string; data?: string[] };
type SongSection = { id: string; name: string; bars: number; color: string; ideas: Idea[] };
type Project = { id: string; name: string; bpm: number; meter: string; key: string; updated: number; sections: SongSection[] };
type Screen = "home" | "projects" | "project" | "chords" | "melody" | "metronome" | "settings";
type ChordDraft = { id: string; name: string; beats: number };

const ROOTS: Root[] = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MODES: Mode[] = ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "harmonic minor", "minor pentatonic"];
const COLORS = ["mint", "violet", "amber", "blue", "coral"];
const uid = () => Math.random().toString(36).slice(2, 10);
const clampBpm = (bpm: number) => Math.max(30, Math.min(260, Number.isFinite(bpm) ? Math.round(bpm) : 120));
const titleMode = (mode: Mode) => mode.replace(/\b\w/g, letter => letter.toUpperCase());
const normalizeAccidentals = (value: string) => value.replace(/C#/g, "Db").replace(/D#/g, "Eb").replace(/F#/g, "Gb").replace(/G#/g, "Ab").replace(/A#/g, "Bb");
const projectHarmony = (project?: Project): { root: Root; mode: Mode } => {
  const [savedRoot = "C", ...savedMode] = normalizeAccidentals(project?.key ?? "C major").split(" ");
  const root = ROOTS.includes(savedRoot as Root) ? savedRoot as Root : "C";
  const mode = savedMode.join(" ").toLowerCase() as Mode;
  return { root, mode: MODES.includes(mode) ? mode : "major" };
};
const formatProjectKey = (root: Root, mode: Mode) => `${root} ${titleMode(mode)}`;
const makeChordDrafts = (root: Root, mode: Mode, count: number, complexity: Complexity, seed: number, defaultBeats = 4, variation = 0): ChordDraft[] =>
  generateChordProgression({ root, mode, bars: count, complexity, seed }).map((chord, index) => {
    const wiggle = Math.round((variation / 100) * Math.max(1, defaultBeats - 1));
    const offset = wiggle ? ((Math.abs(seed * 31 + index * 17) % (wiggle * 2 + 1)) - wiggle) : 0;
    return { id: uid(), name: chord.name, beats: Math.max(1, Math.min(8, defaultBeats + offset)) };
  });
const decodeChordDrafts = (idea: Idea): ChordDraft[] => (idea.data?.length ? idea.data : idea.detail.split(" · ")).map(value => { const [name, savedBeats] = value.split("|"); return { id: uid(), name, beats: Number(savedBeats) || 4 }; });

const STARTER_PROJECTS: Project[] = [
  { id: "midnight", name: "Midnight Thoughts", bpm: 124, meter: "4/4", key: "E Dorian", updated: Date.now(), sections: [
    { id: "intro", name: "Intro", bars: 4, color: "violet", ideas: [{ id: "i1", type: "text", name: "Atmosphere", detail: "Start sparse. Let the guitar harmonics breathe." }] },
    { id: "verse", name: "Verse", bars: 8, color: "mint", ideas: [{ id: "i2", type: "chords", name: "Verse harmony", detail: "Em9 · A13 · Dmaj9 · Bm7", data: ["Em9", "A13", "Dmaj9", "Bm7"] }] },
    { id: "chorus", name: "Chorus", bars: 8, color: "amber", ideas: [] },
  ]},
  { id: "fading", name: "Fading Lights", bpm: 98, meter: "6/8", key: "A minor", updated: Date.now() - 86400000, sections: [
    { id: "f-verse", name: "Verse", bars: 8, color: "blue", ideas: [] },
    { id: "f-hook", name: "Hook", bars: 4, color: "coral", ideas: [{ id: "f1", type: "text", name: "Lyric seed", detail: "Leave the last word hanging." }] },
  ]},
];

function Wave({ tone = "mint", bars = 7 }: { tone?: string; bars?: number }) {
  return <div className={`wave-mark ${tone}`} aria-hidden="true">{Array.from({ length: bars }, (_, i) => <i key={i} style={{ height: 10 + ((i * 17 + 11) % 30) }} />)}</div>;
}

function useProjects() {
  const [projects, setProjects] = useState<Project[]>(STARTER_PROJECTS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      try { const saved = localStorage.getItem("inspitivity-projects"); if (saved) setProjects((JSON.parse(saved) as Project[]).map(project => ({ ...project, key: normalizeAccidentals(project.key), sections: project.sections.map(section => ({ ...section, ideas: section.ideas.map(idea => ({ ...idea, detail: normalizeAccidentals(idea.detail), data: idea.data?.map(normalizeAccidentals) })) })) }))); } catch { /* keep starter data */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem("inspitivity-projects", JSON.stringify(projects)); }, [projects, ready]);
  return [projects, setProjects] as const;
}

function saveRecording(id: string, blob: Blob) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("inspitivity-audio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const tx = request.result.transaction("recordings", "readwrite"); tx.objectStore("recordings").put(blob, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); };
  });
}

function getRecording(id: string) {
  return new Promise<Blob | undefined>((resolve, reject) => {
    const request = indexedDB.open("inspitivity-audio", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const store = request.result.transaction("recordings", "readonly").objectStore("recordings"); const read = store.get(id); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); };
  });
}

function Topbar({ title, subtitle, onBack, onCreate }: { title: string; subtitle?: string; onBack?: () => void; onCreate?: () => void }) {
  return <header className="topbar">{onBack ? <button className="back-button" onClick={onBack} aria-label="Go back">←</button> : <div><p className="eyebrow">{subtitle}</p><h1>{title}</h1></div>}{onBack && <div className="center-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>}{onCreate && <button className="round-button" onClick={onCreate} aria-label="Create a project">+</button>}</header>;
}

function BottomNav({ screen, go, create }: { screen: Screen; go: (s: Screen) => void; create: () => void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">
    <button className={screen === "home" ? "active" : ""} onClick={() => go("home")}><b>⌂</b><span>Home</span></button>
    <button className={screen === "projects" || screen === "project" ? "active" : ""} onClick={() => go("projects")}><b>▱</b><span>Projects</span></button>
    <button className="create" onClick={create} aria-label="Create">+</button>
    <button className={["chords", "melody", "metronome"].includes(screen) ? "active" : ""} onClick={() => go("chords")}><b>⌘</b><span>Tools</span></button>
    <button className={screen === "settings" ? "active" : ""} onClick={() => go("settings")}><b>◎</b><span>Settings</span></button>
  </nav>;
}

function useAudioEngine() {
  const context = useRef<AudioContext | null>(null);
  const active = useRef<Set<OscillatorNode>>(new Set());
  return useMemo(() => {
    const get = () => context.current ?? (context.current = new AudioContext());
    const tone = (midi: number, start = 0, duration = .22, gain = .07) => {
      const ctx = get(); const oscillator = ctx.createOscillator(); const volume = ctx.createGain();
      oscillator.type = "triangle"; oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      volume.gain.setValueAtTime(gain, ctx.currentTime + start); volume.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + start + duration);
      oscillator.connect(volume).connect(ctx.destination); active.current.add(oscillator); oscillator.onended = () => active.current.delete(oscillator); oscillator.start(ctx.currentTime + start); oscillator.stop(ctx.currentTime + start + duration);
    };
    const stopAll = () => { active.current.forEach(oscillator => { try { oscillator.stop(); } catch { /* already stopped */ } }); active.current.clear(); };
    return { tone, get, stopAll };
  }, []);
}

function useLoopTransport(playOnce: () => void, durationMs: number, stopAudio: () => void) {
  const [mode, setMode] = useState<"stopped" | "once" | "loop">("stopped");
  const timer = useRef<number | null>(null);
  const playRef = useRef(playOnce);
  const durationRef = useRef(durationMs);
  useEffect(() => { playRef.current = playOnce; durationRef.current = durationMs; }, [playOnce, durationMs]);
  const clear = useCallback(() => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; stopAudio(); }, [stopAudio]);
  const stop = useCallback(() => { clear(); setMode("stopped"); }, [clear]);
  const start = useCallback((loop: boolean) => {
    clear(); setMode(loop ? "loop" : "once");
    const run = () => {
      playRef.current();
      timer.current = window.setTimeout(() => loop ? run() : setMode("stopped"), Math.max(120, durationRef.current));
    };
    run();
  }, [clear]);
  useEffect(() => () => clear(), [clear]);
  return { mode, start, stop };
}

export default function InspitivityApp() {
  const [projects, setProjects] = useProjects();
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedId, setSelectedId] = useState("midnight");
  const [modal, setModal] = useState<"project" | "create" | "record" | null>(null);
  const [toast, setToast] = useState("");
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const selected = projects.find(p => p.id === selectedId) ?? projects[0];

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const openProject = (id: string) => { setSelectedId(id); setScreen("project"); };
  const createProject = (name: string, bpm: number, key: string) => {
    const project: Project = { id: uid(), name, bpm, meter: "4/4", key, updated: Date.now(), sections: [{ id: uid(), name: "Verse", bars: 8, color: "mint", ideas: [] }, { id: uid(), name: "Chorus", bars: 8, color: "violet", ideas: [] }] };
    setProjects(p => [project, ...p]); setSelectedId(project.id); setModal(null); setScreen("project");
  };
  const updateSelected = useCallback((fn: (project: Project) => Project) => setProjects(items => items.map(p => p.id === selectedId ? { ...fn(p), updated: Date.now() } : p)), [selectedId, setProjects]);
  const saveIdea = (type: Idea["type"], name: string, detail: string, data?: string[]) => {
    if (!selected?.sections[0]) return;
    if (editingIdea) { updateSelected(project => ({ ...project, sections: project.sections.map(section => ({ ...section, ideas: section.ideas.map(idea => idea.id === editingIdea.id ? { ...idea, type, name, detail, data } : idea) })) })); notify(`Updated ${editingIdea.name}`); setEditingIdea(null); return; }
    updateSelected(project => ({ ...project, sections: project.sections.map((section, i) => i === 0 ? { ...section, ideas: [...section.ideas, { id: uid(), type, name, detail, data }] } : section) }));
    notify(`Saved to ${selected.name} · ${selected.sections[0].name}`);
  };

  return <main className="app-shell">
    {screen === "home" && <Home projects={projects} openProject={openProject} go={setScreen} create={() => setModal("create")} record={() => setModal("record")} />}
    {screen === "projects" && <Projects projects={projects} openProject={openProject} create={() => setModal("project")} />}
    {screen === "project" && selected && <ProjectView project={selected} update={updateSelected} back={() => setScreen("projects")} tools={setScreen} record={() => setModal("record")} editIdea={idea => { if (idea.type === "chords" || idea.type === "melody") { setEditingIdea(idea); setScreen(idea.type); } }} />}
    {screen === "chords" && selected && <ChordTool key={editingIdea?.id ?? "new-chords"} idea={editingIdea?.type === "chords" ? editingIdea : undefined} project={selected} updateProject={updateSelected} back={() => setScreen("home")} save={saveIdea} go={setScreen} />}
    {screen === "melody" && selected && <MelodyTool key={editingIdea?.id ?? "new-melody"} project={selected} updateProject={updateSelected} back={() => setScreen("home")} save={saveIdea} go={setScreen} />}
    {screen === "metronome" && selected && <Metronome project={selected} updateProject={updateSelected} back={() => setScreen("home")} go={setScreen} />}
    {screen === "settings" && <Settings projects={projects} backUp={() => { const blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "inspitivity-backup.json"; a.click(); notify("Local backup downloaded"); }} />}
    <BottomNav screen={screen} go={setScreen} create={() => setModal("create")} />
    {modal === "project" && <ProjectModal close={() => setModal(null)} submit={createProject} />}
    {modal === "create" && <CreateModal close={() => setModal(null)} choose={(action) => { setModal(null); if (action === "project") setModal("project"); else if (action === "record") setModal("record"); else setScreen(action); }} />}
    {modal === "record" && selected && <RecorderModal project={selected} close={() => setModal(null)} attach={(sectionId, idea) => { updateSelected(p => ({ ...p, sections: p.sections.map(s => s.id === sectionId ? { ...s, ideas: [...s.ideas, idea] } : s) })); notify("Recording saved locally"); }} />}
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </main>;
}

function Home({ projects, openProject, go, create, record }: { projects: Project[]; openProject: (id: string) => void; go: (s: Screen) => void; create: () => void; record: () => void }) {
  return <><Topbar title="Inspitivity" subtitle="Your songwriting partner" onCreate={create} />
    <section className="hero-card"><div className="local-badge"><span className="status-dot" /> Local workspace</div><h2>Turn the spark<br />into a song.</h2><p>Capture ideas, shape the arrangement and find the next chord—without breaking your flow.</p><button className="primary-button" onClick={create}>Start creating <span>↗</span></button><Wave bars={11} /></section>
    <SectionTitle eyebrow="Pick up where you left off" title="Recent projects" action="View all" onAction={() => go("projects")} />
    <div className="project-grid">{projects.slice(0, 3).map((p, i) => <button className={`project-card ${COLORS[i % COLORS.length]}`} key={p.id} onClick={() => openProject(p.id)}><Wave tone={COLORS[i % COLORS.length]} /><span>{p.sections.length} sections · {p.bpm} BPM</span><h4>{p.name}</h4><p>{p.key} · {p.meter}</p></button>)}<button className="new-project-card" onClick={create}><b>+</b><span>New project</span></button></div>
    <SectionTitle eyebrow="Built for momentum" title="Creative tools" />
    <div className="tool-grid"><ToolButton tone="mint" icon="♯" title="Chord Progression" copy="Generate harmonies" onClick={() => go("chords")} /><ToolButton tone="violet" icon="⌁" title="Melody Generator" copy="Shape a new motif" onClick={() => go("melody")} /><ToolButton tone="amber" icon="♩" title="Metronome" copy="Keep time, stay loose" onClick={() => go("metronome")} /><ToolButton tone="coral" icon="●" title="Quick Record" copy="Catch the moment" onClick={record} /></div>
  </>;
}

function SectionTitle({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) { return <section className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h3>{title}</h3></div>{action && <button onClick={onAction}>{action}</button>}</section>; }
function ToolButton({ tone, icon, title, copy, onClick }: { tone: string; icon: string; title: string; copy: string; onClick: () => void }) { return <button onClick={onClick}><span className={`tool-icon ${tone}`}>{icon}</span><div><b>{title}</b><small>{copy}</small></div><i>→</i></button>; }

function Projects({ projects, openProject, create }: { projects: Project[]; openProject: (id: string) => void; create: () => void }) {
  return <><Topbar title="Projects" subtitle="Your songbook" onCreate={create} /><div className="projects-toolbar"><p>{projects.length} works in progress</p><button>Recently edited ↓</button></div><div className="projects-list">{projects.map((p, index) => <button key={p.id} onClick={() => openProject(p.id)}><span className={`project-avatar ${COLORS[index % COLORS.length]}`}><Wave tone={COLORS[index % COLORS.length]} bars={5} /></span><div><h3>{p.name}</h3><p>{p.sections.length} sections · {p.bpm} BPM · {p.key}</p><div className="mini-arrangement">{p.sections.map(s => <i key={s.id} style={{ flex: s.bars }} />)}</div></div><b>→</b></button>)}</div></>;
}

function ProjectView({ project, update, back, tools, record, editIdea }: { project: Project; update: (fn: (p: Project) => Project) => void; back: () => void; tools: (s: Screen) => void; record: () => void; editIdea: (idea: Idea) => void }) {
  const [adding, setAdding] = useState(false); const [ideaSection, setIdeaSection] = useState<string | null>(null); const [note, setNote] = useState(""); const [sectionName, setSectionName] = useState(""); const [arrangementPlaying, setArrangementPlaying] = useState(false); const arrangementTimer = useRef<number | null>(null); const engine = useAudioEngine();
  const move = (index: number, direction: number) => update(p => { const sections = [...p.sections]; const target = index + direction; if (target < 0 || target >= sections.length) return p; [sections[index], sections[target]] = [sections[target], sections[index]]; return { ...p, sections }; });
  const stopArrangement = useCallback(() => { if (arrangementTimer.current) window.clearTimeout(arrangementTimer.current); arrangementTimer.current = null; engine.stopAll(); setArrangementPlaying(false); }, [engine]);
  const playArrangement = () => { if (arrangementPlaying) { stopArrangement(); return; } engine.stopAll(); const { root, mode } = projectHarmony(project); const beat = beatDurationSeconds(project.bpm); const beatsPerBar = Number(project.meter.split("/")[0]) || 4; let offset = 0; project.sections.forEach((section, sectionIndex) => { const sectionBeats = section.bars * beatsPerBar; const savedHarmony = section.ideas.find(idea => idea.type === "chords"); const harmony = savedHarmony ? (savedHarmony.data?.length ? savedHarmony.data : savedHarmony.detail.split(" · ")) : generateChordProgression({ root, mode, bars: Math.max(1, Math.ceil(sectionBeats / 4)), complexity: "medium", seed: sectionIndex + 1 }).map(chord => `${chord.name}|4`); let chordBeat = 0; let chordIndex = 0; while (chordBeat < sectionBeats) { const [name, savedBeats] = harmony[chordIndex % harmony.length].split("|"); const duration = Math.min(Number(savedBeats) || 4, sectionBeats - chordBeat); const pitch = notePitchClass(name); if (pitch !== null) chordIntervals(name).forEach(interval => engine.tone(48 + pitch + interval, (offset + chordBeat) * beat, duration * beat * .88, .032)); chordBeat += duration; chordIndex++; } const savedMelody = section.ideas.find(idea => idea.type === "melody"); const melody = savedMelody?.data?.length ? savedMelody.data.map((value, index) => { const [name, start, duration, pitch] = value.split("|"); return { pitch: Number(pitch) || 60 + (notePitchClass(name) ?? 0), start: Number(start) || index * .5, duration: Number(duration) || .45 }; }) : generateMelody({ root, mode, notes: Math.max(8, Math.floor(sectionBeats * 1.5)), density: .55, mood: "calm", seed: sectionIndex + 11 }); melody.forEach(note => { const start = note.start % sectionBeats; if (start < sectionBeats) engine.tone(note.pitch, (offset + start) * beat, Math.min(note.duration, sectionBeats - start) * beat * .82, .04); }); for (let localBeat = 0; localBeat < sectionBeats; localBeat++) { const start = (offset + localBeat) * beat; engine.tone(localBeat % beatsPerBar === 0 ? 36 : 42, start, .075, localBeat % beatsPerBar === 0 ? .09 : .025); engine.tone(46, start + beat * .5, .035, .012); } offset += sectionBeats; }); setArrangementPlaying(true); arrangementTimer.current = window.setTimeout(() => { arrangementTimer.current = null; setArrangementPlaying(false); }, offset * beat * 1000); };
  useEffect(() => () => stopArrangement(), [stopArrangement]);
  const playIdea = async (idea: Idea) => { engine.stopAll(); const beat = beatDurationSeconds(project.bpm); if (idea.type === "chords") { let start = 0; (idea.data?.length ? idea.data : idea.detail.split(" · ")).forEach(value => { const [name, savedBeats] = value.split("|"); const beats = Number(savedBeats) || 4; const pitch = notePitchClass(name); if (pitch !== null) chordIntervals(name).forEach(interval => engine.tone(48 + pitch + interval, start * beat, beats * beat * .9, .035)); start += beats; }); return; } if (idea.type === "melody") { (idea.data ?? []).forEach((value, index) => { const [name, savedStart, savedDuration, savedPitch] = value.split("|"); const pitch = Number(savedPitch) || 60 + (notePitchClass(name) ?? 0); engine.tone(pitch, Number(savedStart) || index * .5, (Number(savedDuration) || .45) * beat, .055); }); return; } if (idea.type === "audio" && idea.recordingId) { const blob = await getRecording(idea.recordingId); if (blob) { const url = URL.createObjectURL(blob); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play(); } } };
  return <><Topbar title={project.name} subtitle={`${project.key} · ${project.bpm} BPM · ${project.meter}`} onBack={back} /><div className="project-summary"><div><span>Song progress</span><div className="song-summary-actions"><button className={arrangementPlaying ? "song-play playing" : "song-play"} onClick={playArrangement}>{arrangementPlaying ? "■ Stop song" : "▶ Play song"}</button><b>{project.sections.reduce((n, s) => n + s.bars, 0)} bars</b></div></div><div className="arrangement-line">{project.sections.map(s => <i className={s.color} style={{ flex: s.bars }} key={s.id} />)}</div></div>
    <SectionTitle eyebrow="" title="Arrangement" action="+ Add section" onAction={() => setAdding(true)} />
    <div className="arrangement-list">{project.sections.map((section, index) => <article key={section.id} className={`section-card ${section.color}`}><div className="drag">⠿</div><div className="section-count">{String(index + 1).padStart(2, "0")}</div><div className="section-main"><header><div><h3>{section.name}</h3><span>{section.bars} bars · {section.ideas.length} ideas</span></div><div className="order-controls"><button onClick={() => move(index, -1)} aria-label="Move up">↑</button><button onClick={() => move(index, 1)} aria-label="Move down">↓</button></div></header>{section.ideas.length > 0 && <div className="idea-chips">{section.ideas.map(idea => <article key={idea.id}><b>{idea.type === "audio" ? "●" : idea.type === "chords" ? "♯" : idea.type === "melody" ? "⌁" : "✎"}</b><div><strong>{idea.name}</strong><small>{idea.detail}</small></div><div className="idea-actions">{idea.type !== "text" && <button onClick={() => playIdea(idea)} aria-label={`Play ${idea.name}`}>▶</button>}{(idea.type === "chords" || idea.type === "melody") && <button onClick={() => editIdea(idea)} aria-label={`Edit ${idea.name}`}>↗</button>}</div></article>)}</div>}<button className="add-idea" onClick={() => setIdeaSection(section.id)}>+ Add idea</button></div></article>)}</div>
    <div className="project-actions"><button onClick={record}>● Record</button><button onClick={() => tools("chords")}>♯ Chords</button><button onClick={() => tools("melody")}>⌁ Melody</button></div>
    {adding && <div className="modal-layer"><div className="modal small"><button className="modal-close" onClick={() => setAdding(false)}>×</button><p className="eyebrow">New section</p><h2>Where does the song go next?</h2><label className="field"><span>Section name</span><input value={sectionName} onChange={event => setSectionName(event.target.value)} placeholder="Bridge, pre-chorus, outro…" /></label><button className="primary-button wide" disabled={!sectionName.trim()} onClick={() => { update(p => ({ ...p, sections: [...p.sections, { id: uid(), name: sectionName.trim(), bars: 8, color: COLORS[p.sections.length % COLORS.length], ideas: [] }] })); setSectionName(""); setAdding(false); }}>Add section</button></div></div>}
    {ideaSection && <div className="modal-layer"><div className="modal small"><button className="modal-close" onClick={() => setIdeaSection(null)}>×</button><p className="eyebrow">Text idea</p><h2>Catch the thought</h2><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Lyric, production note, or arrangement thought…" /><button className="primary-button wide" onClick={() => { if (!note.trim()) return; update(p => ({ ...p, sections: p.sections.map(s => s.id === ideaSection ? { ...s, ideas: [...s.ideas, { id: uid(), type: "text", name: "Note", detail: note }] } : s) })); setNote(""); setIdeaSection(null); }}>Save idea</button></div></div>}
  </>;
}

function ToolHeader({ title, subtitle, back, go, active }: { title: string; subtitle: string; back: () => void; go: (s: Screen) => void; active: Screen }) { return <><Topbar title={title} subtitle={subtitle} onBack={back} /><div className="tool-tabs"><button className={active === "chords" ? "active" : ""} onClick={() => go("chords")}>Chords</button><button className={active === "melody" ? "active" : ""} onClick={() => go("melody")}>Melody</button><button className={active === "metronome" ? "active" : ""} onClick={() => go("metronome")}>Metronome</button></div></>; }

function ProjectContext({ project, update, onHarmonyChange }: { project: Project; update: (fn: (p: Project) => Project) => void; onHarmonyChange?: (root: Root, mode: Mode) => void }) {
  const { root, mode } = projectHarmony(project);
  const changeHarmony = (nextRoot: Root, nextMode: Mode) => { update(p => ({ ...p, key: formatProjectKey(nextRoot, nextMode) })); onHarmonyChange?.(nextRoot, nextMode); };
  return <section className="project-context" aria-label="Project music settings"><div className="project-context-title"><span>Project settings</span><b>{project.name}</b></div><label className="key-highlight"><span>Key</span><select aria-label="Project root key" value={root} onChange={event => changeHarmony(event.target.value as Root, mode)}>{ROOTS.map(note => <option key={note}>{note}</option>)}</select><select aria-label="Project mode" value={mode} onChange={event => changeHarmony(root, event.target.value as Mode)}>{MODES.map(option => <option key={option}>{option}</option>)}</select></label><label className="global-tempo"><span>Tempo</span><input aria-label="Project tempo" type="number" min="30" max="260" value={project.bpm} onChange={event => update(p => ({ ...p, bpm: clampBpm(Number(event.target.value)) }))} /><b>BPM</b></label></section>;
}

function ChordTool({ idea, project, updateProject, back, save, go }: { idea?: Idea; project: Project; updateProject: (fn: (p: Project) => Project) => void; back: () => void; save: (t: Idea["type"], n: string, d: string, data?: string[]) => void; go: (s: Screen) => void }) {
  const { root, mode } = projectHarmony(project); const [count, setCount] = useState(idea?.data?.length || 4); const [defaultBeats, setDefaultBeats] = useState(4); const [lengthVariation, setLengthVariation] = useState(0); const [complexity, setComplexity] = useState<Complexity>("medium"); const [seed, setSeed] = useState(1); const [chords, setChords] = useState<ChordDraft[]>(() => idea ? decodeChordDrafts(idea) : makeChordDrafts(root, mode, 4, "medium", 1)); const engine = useAudioEngine();
  const regenerate = (nextRoot = root, nextMode = mode) => { const nextSeed = seed + 1; setSeed(nextSeed); setChords(makeChordDrafts(nextRoot, nextMode, count, complexity, nextSeed, defaultBeats, lengthVariation)); };
  const totalBeats = chords.reduce((sum, chord) => sum + chord.beats, 0); const beatSeconds = beatDurationSeconds(project.bpm);
  const play = useCallback(() => { let startBeat = 0; chords.forEach(chord => { const pitch = notePitchClass(chord.name); if (pitch !== null) chordIntervals(chord.name).forEach(interval => engine.tone(48 + pitch + interval, startBeat * beatSeconds, chord.beats * beatSeconds * .92, .035)); startBeat += chord.beats; }); }, [chords, beatSeconds, engine]);
  const transport = useLoopTransport(play, progressionLoopDurationMs(totalBeats, project.bpm), engine.stopAll);
  const updateChord = (id: string, changes: Partial<ChordDraft>) => setChords(items => items.map(chord => chord.id === id ? { ...chord, ...changes } : chord));
  return <><ToolHeader title="Chord Progression" subtitle="Generate and shape harmonies in whole notes" back={back} go={go} active="chords" /><ProjectContext project={project} update={updateProject} onHarmonyChange={(nextRoot, nextMode) => regenerate(nextRoot, nextMode)} /><div className="tool-layout"><section className="control-panel"><ControlTitle n="1" title="Number of chords" /><label className="range-control"><span>{count} chords</span><input aria-label="Number of chords" type="range" min="2" max="12" step="1" value={count} onChange={event => setCount(Number(event.target.value))} /></label><ControlTitle n="2" title="Default chord length" /><label className="range-control"><span>{defaultBeats} beats {defaultBeats === 4 ? "· whole note" : ""}</span><input aria-label="Default chord length" type="range" min="1" max="8" step="1" value={defaultBeats} onChange={event => setDefaultBeats(Number(event.target.value))} /></label><ControlTitle n="3" title="Length variation" /><label className="range-control"><span>{lengthVariation === 0 ? "Uniform" : `${lengthVariation}% variation`}</span><input aria-label="Chord length variation" type="range" min="0" max="100" step="5" value={lengthVariation} onChange={event => setLengthVariation(Number(event.target.value))} /></label><ControlTitle n="4" title="Complexity" /><Segment options={["simple", "medium", "advanced"]} value={complexity} set={v => setComplexity(v as Complexity)} /><p className="control-note">Each generated chord uses the selected default duration; variation introduces longer and shorter holds. You can still edit every chord directly.</p><button className="primary-button wide" onClick={() => regenerate()}>Generate progression <span>↻</span></button></section>
    <section className="result-panel"><div className="result-heading"><div><p className="eyebrow">{idea ? "Editing saved progression" : "Your progression"}</p><h2>{formatProjectKey(root, mode)}</h2></div><button className="listen-button" onClick={() => transport.mode === "stopped" ? transport.start(false) : transport.stop()}>{transport.mode === "stopped" ? "▶ Listen" : "■ Stop"}</button></div><div className="chord-editor">{chords.map((chord, index) => <article key={chord.id}><span className="chord-number">{index + 1}</span><label><span>Chord</span><input aria-label={`Chord ${index + 1}`} value={chord.name} onChange={event => updateChord(chord.id, { name: event.target.value })} /></label><label><span>Length</span><select aria-label={`Chord ${index + 1} length`} value={chord.beats} onChange={event => updateChord(chord.id, { beats: Number(event.target.value) })}><option value="1">1 beat</option><option value="2">2 beats</option><option value="4">4 beats · whole</option><option value="8">8 beats</option></select></label><button className="remove-chord" aria-label={`Remove chord ${index + 1}`} disabled={chords.length === 1} onClick={() => setChords(items => items.filter(item => item.id !== chord.id))}>×</button></article>)}</div><button className="add-chord" onClick={() => setChords(items => [...items, { id: uid(), name: `${root}${["minor", "dorian", "phrygian", "harmonic minor", "minor pentatonic"].includes(mode) ? "m" : ""}`, beats: defaultBeats }])}>＋ Add chord</button><div className={`playback-bar ${transport.mode !== "stopped" ? "is-playing" : ""}`}><button onClick={() => transport.mode === "once" ? transport.stop() : transport.start(false)} aria-label={transport.mode === "once" ? "Stop progression" : "Play progression"}>{transport.mode === "once" ? "■" : "▶"}</button><Wave bars={22} /><span>{project.bpm} BPM · {totalBeats} beats</span><button className={`loop-button ${transport.mode === "loop" ? "active" : ""}`} onClick={() => transport.mode === "loop" ? transport.stop() : transport.start(true)} aria-label={transport.mode === "loop" ? "Stop looping progression" : "Loop progression"} aria-pressed={transport.mode === "loop"}>↻<small>{transport.mode === "loop" ? "Looping" : "Loop"}</small></button></div><button className="secondary-button wide" onClick={() => save("chords", `${formatProjectKey(root, mode)} progression`, chords.map(c => `${c.name} (${c.beats} beats)`).join(" · "), chords.map(c => `${c.name}|${c.beats}`))}>{idea ? "✓ Update progression" : `＋ Save to ${project.name}`}</button></section></div></>;
}

function MelodyTool({ project, updateProject, back, save, go }: { project: Project; updateProject: (fn: (p: Project) => Project) => void; back: () => void; save: (t: Idea["type"], n: string, d: string, data?: string[]) => void; go: (s: Screen) => void }) {
  const { root, mode } = projectHarmony(project); const [mood, setMood] = useState<MelodyMood>("calm"); const [density, setDensity] = useState(.6); const [seed, setSeed] = useState(7); const engine = useAudioEngine();
  const melody = useMemo(() => generateMelody({ root, mode, density, mood, seed }), [root, mode, density, mood, seed]);
  const bpm = project.bpm; const beatSeconds = beatDurationSeconds(bpm);
  const play = useCallback(() => melody.forEach(n => engine.tone(n.pitch, n.start * beatSeconds, n.duration * beatSeconds * .9, .055)), [melody, beatSeconds, engine]);
  const transport = useLoopTransport(play, melodyLoopDurationMs(melody, bpm), engine.stopAll);
  const changeNote = (index: number, delta: number) => setSeed(s => s + index * 3 + delta);
  const moods: Array<[MelodyMood, string]> = [["calm", "≈"], ["bright", "☼"], ["melancholic", "☂"], ["dark", "◔"]];
  return <><ToolHeader title="Melody Generator" subtitle="Shape motifs with movement and intention" back={back} go={go} active="melody" /><ProjectContext project={project} update={updateProject} /><div className="tool-layout"><section className="control-panel violet-panel"><ControlTitle n="1" title="Mood" /><div className="mood-grid">{moods.map(([name, icon]) => <button key={name} className={mood === name ? "active" : ""} onClick={() => setMood(name)}><b>{icon}</b><span>{name}</span></button>)}</div><ControlTitle n="2" title="Rhythmic density" /><input className="density-range" aria-label="Rhythmic density" type="range" min=".2" max="1" step=".1" value={density} onChange={e => setDensity(Number(e.target.value))} /><button className="primary-button violet-button wide" onClick={() => setSeed(s => s + 1)}>Generate melody <span>↻</span></button></section>
    <section className="result-panel"><div className="result-heading"><div><p className="eyebrow violet-text">Your melody</p><h2>{mood} motif · {formatProjectKey(root, mode)}</h2></div><button className="listen-button violet-listen" onClick={() => transport.mode === "stopped" ? transport.start(false) : transport.stop()}>{transport.mode === "stopped" ? "▶ Listen" : "■ Stop"}</button></div><div className="piano-roll">{melody.map((note, i) => <button key={i} title={`${note.note} — tap to vary`} onClick={() => changeNote(i, 1)} style={{ left: `${2 + i * (94 / melody.length)}%`, bottom: `${10 + ((note.pitch - 45) % 22) * 3.5}%`, width: `${Math.max(3, note.duration * 4)}%` }}><i /><span>{note.note}</span></button>)}</div><div className={`playback-bar violet-wave ${transport.mode !== "stopped" ? "is-playing" : ""}`}><button onClick={() => transport.mode === "once" ? transport.stop() : transport.start(false)} aria-label={transport.mode === "once" ? "Stop melody" : "Play melody"}>{transport.mode === "once" ? "■" : "▶"}</button><Wave tone="violet" bars={22} /><span>{bpm} BPM</span><button className={`loop-button ${transport.mode === "loop" ? "active" : ""}`} onClick={() => transport.mode === "loop" ? transport.stop() : transport.start(true)} aria-label={transport.mode === "loop" ? "Stop looping melody" : "Loop melody"} aria-pressed={transport.mode === "loop"}>↻<small>{transport.mode === "loop" ? "Looping" : "Loop"}</small></button></div><button className="secondary-button wide" onClick={() => save("melody", `${mood} ${root} ${mode} melody`, melody.map(n => n.note).join(" · "), melody.map(n => n.note))}>＋ Save to {project.name}</button></section></div></>;
}

function Metronome({ project, updateProject, back, go }: { project: Project; updateProject: (fn: (p: Project) => Project) => void; back: () => void; go: (s: Screen) => void }) {
  const bpm = project.bpm; const meter = project.meter; const setBpm = (value: number | ((bpm: number) => number)) => updateProject(p => ({ ...p, bpm: clampBpm(typeof value === "function" ? value(p.bpm) : value) })); const [subdivision, setSubdivision] = useState(1); const [playing, setPlaying] = useState(false); const [beat, setBeat] = useState(0); const taps = useRef<number[]>([]); const timer = useRef<number | null>(null); const engine = useAudioEngine();
  const stop = useCallback(() => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; setPlaying(false); setBeat(0); }, []);
  useEffect(() => { if (!playing) return; let next = engine.get().currentTime; let currentBeat = 0; const beats = Number(meter.split("/")[0]); const schedule = () => { const ctx = engine.get(); while (next < ctx.currentTime + .12) { const accented = isAccentedStep(currentBeat, beats, subdivision); engine.tone(accented ? 88 : 80, Math.max(0, next - ctx.currentTime), .04, accented ? .11 : .055); setBeat(Math.floor(currentBeat / subdivision) % beats); next += subdivisionDurationSeconds(bpm, subdivision); currentBeat++; } timer.current = window.setTimeout(schedule, 30); }; schedule(); return stop; }, [playing, bpm, meter, subdivision, engine, stop]);
  const tap = () => { const now = performance.now(); taps.current = [...taps.current.filter(t => now - t < 2500), now].slice(-5); const tempo = calculateTapTempo(taps.current); if (tempo) setBpm(tempo); };
  const beats = Number(meter.split("/")[0]);
  return <><ToolHeader title="Metronome" subtitle="A steady pulse that stays out of the way" back={back} go={go} active="metronome" /><ProjectContext project={project} update={updateProject} /><div className="metronome-card"><div className="tempo-dial"><button onClick={() => setBpm(b => b - 1)}>−</button><div><input aria-label="Tempo" value={bpm} onChange={e => setBpm(Number(e.target.value))} /><span>PROJECT BPM</span></div><button onClick={() => setBpm(b => b + 1)}>+</button></div><div className="beat-lights">{Array.from({ length: beats }, (_, i) => <i key={i} className={playing && beat === i ? (i === 0 ? "active accent" : "active") : ""} />)}</div><div className="metronome-controls"><Select label="Time signature" value={meter} set={value => updateProject(p => ({ ...p, meter: value }))} options={["4/4", "3/4", "6/8", "5/4", "7/8"]} /><Select label="Subdivision" value={String(subdivision)} set={v => setSubdivision(Number(v))} options={["1", "2", "4"]} /></div><button className={`metronome-play ${playing ? "playing" : ""}`} onClick={() => playing ? stop() : setPlaying(true)}>{playing ? "■ Stop" : "▶ Start"}</button><button className="tap-button" onClick={tap}>Tap tempo</button></div></>;
}

function ControlTitle({ n, title }: { n: string; title: string }) { return <h3 className="control-title"><span>{n}</span>{title}</h3>; }
function Select({ label, value, set, options }: { label: string; value: string; set: (v: string) => void; options: readonly string[] }) { return <label className="select-control"><span>{label}</span><select value={value} onChange={e => set(e.target.value)}>{options.map(o => <option key={o}>{o}</option>)}</select></label>; }
function Segment<T extends string | number>({ options, value, set, suffix = "" }: { options: readonly T[]; value: T; set: (v: T) => void; suffix?: string }) { return <div className="segmented">{options.map(option => <button className={value === option ? "active" : ""} key={option} onClick={() => set(option)}>{String(option)}{suffix}</button>)}</div>; }

function Settings({ projects, backUp }: { projects: Project[]; backUp: () => void }) { return <><Topbar title="Settings" subtitle="Local by default" /><div className="settings-card"><span className="settings-icon">◎</span><h2>Your ideas stay yours.</h2><p>Inspitivity stores your projects and arrangements on this device. Recordings use the browser&apos;s private local database.</p><div className="storage-row"><span>Local projects</span><b>{projects.length}</b></div><div className="storage-row"><span>Cloud account</span><b className="mint-text">Not required</b></div><button className="secondary-button wide" onClick={backUp}>↓ Download project backup</button></div><div className="settings-card compact"><h3>About this prototype</h3><p>Chord and melody generation run deterministically on-device. No musical idea is sent to a server.</p></div></>; }

function ProjectModal({ close, submit }: { close: () => void; submit: (name: string, bpm: number, key: string) => void }) { const [name, setName] = useState(""); const [bpm, setBpm] = useState(120); const [root, setRoot] = useState("E"); const [mode, setMode] = useState("Dorian"); return <div className="modal-layer"><div className="modal"><button className="modal-close" onClick={close}>×</button><p className="eyebrow">New project</p><h2>What are you making?</h2><label className="field"><span>Project title</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Untitled song" /></label><div className="two-cols"><label className="field"><span>BPM</span><input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} /></label><Select label="Root" value={root} set={setRoot} options={ROOTS} /></div><Select label="Mode" value={mode} set={setMode} options={["Major", "Minor", "Dorian", "Mixolydian", "Lydian"]} /><button className="primary-button wide" disabled={!name.trim()} onClick={() => submit(name.trim(), bpm, `${root} ${mode}`)}>Create project</button></div></div>; }

function CreateModal({ close, choose }: { close: () => void; choose: (a: "project" | "record" | "chords" | "melody") => void }) { return <div className="modal-layer"><div className="modal create-modal"><button className="modal-close" onClick={close}>×</button><p className="eyebrow">Stay in the flow</p><h2>Create something</h2><div className="create-choices"><ToolButton tone="coral" icon="●" title="Record idea" copy="Use your microphone" onClick={() => choose("record")} /><ToolButton tone="mint" icon="♯" title="New progression" copy="Find the harmony" onClick={() => choose("chords")} /><ToolButton tone="violet" icon="⌁" title="New melody" copy="Shape a motif" onClick={() => choose("melody")} /><ToolButton tone="amber" icon="＋" title="New project" copy="Start a song" onClick={() => choose("project")} /></div></div></div>; }

function RecorderModal({ project, close, attach }: { project: Project; close: () => void; attach: (sectionId: string, idea: Idea) => void }) {
  const [recording, setRecording] = useState(false); const [elapsed, setElapsed] = useState(0); const [sectionId, setSectionId] = useState(project.sections[0]?.id ?? ""); const [name, setName] = useState("Voice idea"); const recorder = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const clock = useRef<number | null>(null);
  const start = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const media = new MediaRecorder(stream); recorder.current = media; chunks.current = []; media.ondataavailable = e => chunks.current.push(e.data); media.start(); setElapsed(0); setRecording(true); clock.current = window.setInterval(() => setElapsed(t => t + 1), 1000); } catch { alert("Microphone access is needed to record an idea."); } };
  const stop = () => { if (!recorder.current) return; recorder.current.onstop = async () => { const blob = new Blob(chunks.current, { type: recorder.current?.mimeType || "audio/webm" }); const id = uid(); await saveRecording(id, blob); recorder.current?.stream.getTracks().forEach(t => t.stop()); attach(sectionId, { id: uid(), type: "audio", name, detail: `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} · recorded locally`, recordingId: id }); close(); }; recorder.current.stop(); if (clock.current) clearInterval(clock.current); setRecording(false); };
  return <div className="modal-layer"><div className="modal recorder-modal"><button className="modal-close" onClick={close}>×</button><p className="eyebrow coral-text">Quick record</p><h2>{recording ? "Listening…" : "Catch it before it goes."}</h2><div className={`record-visual ${recording ? "active" : ""}`}><Wave tone="coral" bars={18} /><b>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</b></div><label className="field"><span>Idea name</span><input value={name} onChange={e => setName(e.target.value)} /></label><Select label="Save to section" value={sectionId} set={setSectionId} options={project.sections.map(s => s.id)} /><p className="destination-name">{project.name} · {project.sections.find(s => s.id === sectionId)?.name}</p><button className={`record-button ${recording ? "active" : ""}`} onClick={recording ? stop : start}>{recording ? "■ Stop & save" : "● Start recording"}</button></div></div>;
}
