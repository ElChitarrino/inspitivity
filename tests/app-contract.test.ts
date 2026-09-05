import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const source = await readFile(
  resolve(process.cwd(), "app/InspitivityApp.tsx"),
  "utf8",
);

test("the product surface retains all six planned workflows", () => {
  for (const feature of [
    "Projects",
    "Quick Record",
    "Chord Progression",
    "Melody Generator",
    "Drum Loop Generator",
    "Metronome",
  ])
    assert.match(source, new RegExp(feature));
});

test("projects and audio are stored locally without requiring an account", () => {
  assert.match(source, /localStorage\.setItem\("inspitivity-projects"/);
  assert.match(source, /indexedDB\.open\("inspitivity-audio"/);
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
});

test("the songwriting workspace is installable on a phone", async () => {
  const layout = await readFile(resolve(process.cwd(), "app/layout.tsx"), "utf8");
  const manifest = await readFile(resolve(process.cwd(), "app/manifest.ts"), "utf8");
  const serviceWorker = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8");
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(source, /Add to Home Screen/);
  assert.match(layout, /appleWebApp/);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(serviceWorker, /inspitivity-shell-v3/);
});

test("mobile playback explicitly unlocks and masters the Web Audio graph", () => {
  assert.match(source, /const unlock = async \(\) =>/);
  assert.match(source, /context\.state === "running" \? Promise\.resolve\(\) : context\.resume\(\)/);
  assert.match(source, /sharedAudioGraph/);
  assert.match(source, /sharedNativeAudioUnlock\.play/);
  assert.match(source, /const diagnostics = \(\) =>/);
  assert.match(source, /Audio signal active/);
  assert.match(source, /createDynamicsCompressor/);
  assert.match(source, /createConvolver/);
  assert.match(source, /engine\.unlock/);
});

test("the home screen can create a coherent playable sketch in one flow", () => {
  assert.match(source, /What should the idea feel like\?/);
  assert.match(source, /Build playable sketch/);
  assert.match(source, /function buildPlayableSketch/);
  assert.match(source, /Emotive space/);
  assert.match(source, /Neo-soul glow/);
  assert.match(source, /Progressive lift/);
  assert.match(source, /Heavy tension/);
  assert.match(source, /fitMelodyToChords/);
});

test("arrangements expose section creation, ordering, and idea saving", () => {
  assert.match(source, /\+ Add section/);
  assert.match(source, /aria-label="Move up"/);
  assert.match(source, /aria-label="Move down"/);
  assert.match(source, /Save idea/);
});

test("arrangement ideas reopen their saved notes, harmony, or melody for editing", () => {
  assert.match(source, /idea-edit-icon/);
  assert.match(source, /Edit \$\{idea\.name\}/);
  assert.match(source, /decodeChordDrafts/);
  assert.match(source, /decodeMelodyIdea/);
  assert.match(source, /Update note/);
  assert.match(source, /Update melody/);
});

test("arrangement cards themselves reopen their saved editor and sections expose entry controls", () => {
  assert.match(source, /const openIdea/);
  assert.match(source, /className="idea-card"/);
  assert.match(source, /onClick=\{\(\) => openIdea\(section\.id, idea\)\}/);
  assert.match(source, /section-header-actions/);
  assert.match(source, /♯ Chords/);
  assert.match(source, /⌁ Melody/);
});

test("music tools return to the arrangement when they were opened from a project section", () => {
  assert.match(
    source,
    /const \[returnToArrangement, setReturnToArrangement\] = useState\(false\)/,
  );
  assert.match(source, /const backFromMusicTool/);
  assert.match(
    source,
    /const destination = returnToArrangement \? "project" : "home"/,
  );
  assert.match(source, /setScreen\(destination\)/);
  assert.match(source, /setReturnToArrangement\(true\);\s*setScreen\(tool\)/);
  assert.match(source, /back=\{backFromMusicTool\}/);
});

test("arrangement sections and ideas can be removed", () => {
  assert.match(source, /const removeSection/);
  assert.match(source, /const removeIdea/);
  assert.match(source, /aria-label=\{`Remove \$\{section\.name\}`\}/);
  assert.match(source, /aria-label=\{`Remove \$\{idea\.name\}`\}/);
});

test("arrangement playback controls switch to a pause state while an idea is playing", () => {
  assert.match(source, /playingIdeaId/);
  assert.match(source, /Pause \$\{idea\.name\}/);
  assert.match(source, /aria-pressed=\{playingIdeaId === idea\.id\}/);
  assert.match(source, /const stopIdea/);
});

test("an arrangement can play its section harmony, melody, and saved drum loop as one sketch", () => {
  assert.match(source, /Play song/);
  assert.match(source, /function playArrangement|const playArrangement/);
  assert.match(source, /generateChordProgression/);
  assert.match(source, /generateMelody/);
  assert.match(
    source,
    /const savedDrums = section\.ideas\.find\(\(idea\) => idea\.type === "drums"\)/,
  );
  assert.match(
    source,
    /playDrumsForMeterMap\(engine, drums, offset, section, project\.meter, beat\)/,
  );
});

test("arrangement playback highlights its active section and opens section-specific music drafts", () => {
  assert.match(source, /activeSectionIndex/);
  assert.match(source, /setActiveSectionIndex\(sectionIndex\)/);
  assert.match(source, /section-builders/);
  assert.match(source, /openSectionTool\(section\.id, "chords"\)/);
  assert.match(source, /openSectionTool\(section\.id, "melody"\)/);
  assert.match(source, /Editing \{section\.name\}/);
});

test("each arrangement section can be auditioned with its saved or generated sketch", () => {
  assert.match(source, /const playSection/);
  assert.match(source, /playSection\(section, index\)/);
  assert.match(
    source,
    /arrangementPlaying && activeSectionIndex === index\s*\? `Stop \$\{section\.name\}`\s*: `Play \$\{section\.name\}`/,
  );
  assert.match(
    source,
    /playDrumsForMeterMap\(engine, drums, 0, section, project\.meter, beat\)/,
  );
});

test("the metronome supports 9/8 projects", () => {
  assert.match(
    source,
    /options=\{\["4\/4", "3\/4", "6\/8", "9\/8", "5\/4", "7\/8"\]\}/,
  );
});

test("the app gives chords, melody, and drums distinct accessible visual identities", () => {
  assert.match(source, /className=\{`app-shell \$\{screen\}-screen`\}/);
  assert.match(source, /tone="blue"\s*icon="♯"\s*title="Chord Progression"/);
});

test("both generators expose accessible play and loop controls", () => {
  assert.match(source, /Loop progression/);
  assert.match(source, /Loop melody/);
  assert.match(source, /aria-pressed=\{transport\.mode === "loop"\}/);
});

test("songwriting tools offer varied synth voices and MIDI export", () => {
  assert.match(source, /air flute/);
  assert.match(source, /warm pad/);
  assert.match(source, /analog pulse/);
  assert.match(source, /Export chords as MIDI/);
  assert.match(source, /Export melody as MIDI/);
  assert.match(source, /Export pattern as MIDI/);
  assert.match(source, /Export drums as MIDI/);
});

test("project tempo and key are shared by every musical tool", () => {
  assert.match(source, /function ProjectContext/);
  assert.match(source, /bpm: clampBpm/);
  assert.match(source, /key: formatProjectKey/);
  assert.match(
    source,
    /<ProjectContext project=\{project\} update=\{updateProject\}/,
  );
});

test("chords and melodies can add a synchronized project-tempo click while listening", () => {
  assert.match(source, /function scheduleClickTrack/);
  assert.match(source, /Enable click during listening/);
  assert.match(
    source,
    /scheduleClickTrack\(engine, startBeat, beatSeconds, project\.meter\)/,
  );
  assert.doesNotMatch(source, /useWorkspaceMetronome/);
  assert.match(source, /metronomeEnabled=\{toolMetronomeEnabled\}/);
});

test("melody notes preserve the phrase while pitch and duration are edited by drag", () => {
  assert.match(source, /const beginNoteDrag/);
  assert.match(source, /const dragNote/);
  assert.match(source, /action: "pitch" \| "duration"/);
  assert.match(source, /Drag notes up\/down for pitch/);
  assert.match(source, /note\.duration\.toFixed/);
});

test("the melody generator lets writers choose exactly how many notes to generate", () => {
  assert.match(source, /const \[noteCount, setNoteCount\] = useState\(Math\.min\(30, defaultNoteCount\)\)/);
  assert.match(source, /aria-label="Number of melody notes"/);
  assert.match(source, /min="0"/);
  assert.match(source, /max="30"/);
  assert.match(source, /generateMelody\(\{ root, mode, notes: noteCount/);
});

test("chord progressions support whole-note playback and direct editing", () => {
  assert.match(source, /defaultBeats = 4/);
  assert.match(source, /aria-label=\{`Chord \$\{index \+ 1\}`\}/);
  assert.match(source, /Add chord/);
  assert.match(source, /Remove chord/);
  assert.doesNotMatch(source, /Audio-clock scheduling keeps every click tight/);
});

test("the progression editor explains each chord's harmonic role", () => {
  assert.match(source, /const chordRole/);
  assert.match(source, /tonic \/ root/);
  assert.match(source, /className="chord-role"/);
  assert.match(source, /Harmonic role:/);
});

test("drum loops are section-aware, editable, and restricted to the five-piece kit", () => {
  assert.match(source, /function DrumTool/);
  assert.match(source, /DRUM_INSTRUMENTS\.map/);
  assert.match(source, /Try another proven groove/);
  assert.match(source, /Following this section/);
  assert.match(source, /inferGrooveContext/);
  assert.match(source, /openSectionTool\(section\.id, "drums"\)/);
  assert.match(source, /decodeDrumIdea/);
  assert.match(source, /Loop drum loop/);
});

test("progressive workflows include meter maps, synth patterns, transformations, tension, and transitions", () => {
  for (const feature of [
    "meter-map",
    "Synth Pattern",
    "Pattern length",
    "Motif development",
    "Tension map",
    "Transition Builder",
    "Harmony colour",
  ])
    assert.match(source, new RegExp(feature));
  assert.match(source, /openSectionTool\(section\.id, "riff"\)/);
  assert.match(source, /openSectionTool\(section\.id, "transition"\)/);
  assert.match(
    source,
    /"steady",\s*"syncopated",\s*"driving",\s*"djent",\s*"odd meter",\s*"linear"/,
  );
});

test("drum playback uses percussion voices, including a cymbal-like hi-hat", () => {
  assert.match(source, /const createNoiseSample/);
  assert.match(source, /const cymbalNoise/);
  assert.match(source, /instrument === "hihat"/);
  assert.match(source, /6800/);
  assert.match(source, /instrument === "crash"/);
  assert.match(source, /cymbalNoise\(start, 0\.52/);
});
