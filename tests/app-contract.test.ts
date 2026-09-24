import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const source = await readFile(
  resolve(process.cwd(), "app/InspitivityApp.tsx"),
  "utf8",
);
const theme = await readFile(resolve(process.cwd(), "app/theme.css"), "utf8");
const workspace = await readFile(resolve(process.cwd(), "app/workspace.css"), "utf8");

test("fresh standalone instruments cannot inherit or overwrite the last project section", () => {
  const create = source.slice(source.indexOf("const createStandalone ="), source.indexOf("const createProject ="));
  for (const reset of ["setEditingIdea(null)", "setDraftSectionId(null)", "setReturnToArrangement(false)", "savedDraftId.current = null", "setStandaloneProject("]) assert.ok(create.includes(reset));
  assert.match(source, /else createStandalone\(action\)/);
  assert.match(source, /if \(chooseDestination \|\| !returnToArrangement\)/);
  assert.match(source, /selected && \(screen === "project" \|\| returnToArrangement\)/);
  assert.match(source, /const updateEditorProject = returnToArrangement \? updateSelected : setStandaloneProject/);
  assert.match(source, /if \(!returnToArrangement\) return;/);
  assert.match(source, /returnToArrangement \? selected\?\.id : standaloneProject\.id/);
});

test("instrument simplification preserves accessible generation, editing and compact density", async () => {
  const css = await readFile(resolve(process.cwd(), "app/workspace.css"), "utf8");
  assert.match(source, /generator-primary-actions/);
  assert.match(source, /name="generator-group"/);
  assert.match(source, /role="group" aria-label=\{label\}/);
  assert.match(source, /aria-pressed=\{value===mode\}/);
  assert.match(source, /localStorage\.getItem\("inspitivity-density"\)/);
  assert.match(source, /localStorage\.setItem\("inspitivity-density"/);
  assert.match(source, /ArrowLeft.*ArrowRight.*ArrowUp.*ArrowDown.*Home.*End/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /data-density=compact/);
  assert.equal((source.match(/<SoloPreview transport=/g) ?? []).length, 5);
});

test("recording cleanup and save recovery remain wired", () => {
  assert.match(source, /media\.onstop = null/);
  assert.match(source, /media\.stream\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(source, /if \(!mounted\.current\) \{ stream\.getTracks/);
  assert.match(source, /Retry saving recording/);
  assert.match(source, /if \(mounted\.current\) void saveBlob\(blob\)/);
});

test("the product surface retains the core songwriting workflows", () => {
  for (const feature of [
    "Projects",
    "Record idea",
    "Chord Progression",
    "Bass Generator",
    "Melody Generator",
    "Drum Loop Generator",
    "Metronome",
  ])
    assert.match(source, new RegExp(feature));
});

test("project tool navigation stays visible above a compact section player", () => {
  assert.match(source, /returnToArrangement \? "inside-project" : ""/);
  assert.match(source, /\["project", "drums", "chords", "melody", "bass", "riff", "transition", "metronome"\]\.includes\(screen\)/);
  assert.match(source, /back=\{backFromMusicTool\}/);
  assert.match(source, /projectName=\{project\.name\}/);
  assert.match(theme, /\.inside-project \.topbar\{order:-2/);
  assert.match(theme, /\.inside-project \.section-player\{order:-1/);
  assert.doesNotMatch(source, /Loops saved parts plus your current drafts/);
  assert.doesNotMatch(source, /Export saved song as multitrack MIDI/);
  assert.doesNotMatch(source, /New kick patterns, ghost notes/);
});

test("shared play controls are larger, green at rest, and red while playing", () => {
  assert.match(theme, /button\.play-control\{min-width:108px;min-height:50px/);
  assert.match(theme, /background:var\(--play-bg\);color:var\(--play-ink\)/);
  assert.match(theme, /button\.play-control\.playing\{background:var\(--pause-bg\)/);
});

test("arrangement playback exposes timing, looping, count-in, and automatic balance", () => {
  assert.match(source, /aria-label="Playback position"/);
  assert.match(source, /Bar \$\{markerIndex\+1\} · Beat/);
  assert.match(source, /> Count-in</);
  assert.match(source, /↻ Loop/);
  assert.match(source, /automaticSectionMix/);
  assert.match(source, /Auto balance all/);
  assert.match(source, /Peak-safe|peak-safe/);
});

test("bass connects harmony and drums and participates in playback and mixing", () => {
  assert.match(source, /function BassTool/);
  assert.match(source, /function generateBassLine|const generateBassLine/);
  assert.match(source, /Follow kick attacks when drums exist/);
  assert.match(source, /type:"bass"/);
  assert.match(source, /"deep bass"/);
  assert.match(source, /\["bass", "Bass"\]/);
  assert.match(source, /pitchClass === 11 \? 23 : 24 \+ pitchClass/);
  assert.match(source, /const BASS_VOICES/);
  assert.match(source, /const updateBassEvent/);
  assert.match(source, /className={`bass-note-block/);
  assert.match(source, /className="bass-note-popover"/);
  assert.match(source, /Mirror chord roots/);
  assert.match(source, /"808 bass"/);
  assert.match(source, /"sub bass"/);
  assert.match(source, /Edit bass note \$\{index\+1\}/);
  assert.match(source, /const addBassEvent/);
  assert.match(source, /const removeBassEvent/);
  assert.match(source, /const auditionBassEvent/);
  assert.match(source, /Groove direction/);
  assert.match(source, /Harmony relationship/);
  assert.match(source, /Rooted mirrors each chord change/);
  assert.match(source, /generateBassPhrase/);
  assert.match(theme, /\.bass-note-editor/);
});

test("deep bass uses a layered, dry electric-bass signal path", () => {
  assert.match(source, /if \(voice === "deep bass"\)/);
  assert.match(source, /type:"sine" as OscillatorType/);
  assert.match(source, /oscillator.setPeriodicWave\(bassWave!/);
  assert.match(source, /bassHarmonics\(\)/);
  assert.match(source, /body\.type = "lowshelf"/);
  assert.match(source, /connect\(getGraph\(\)\.dryInput\)/);
  assert.match(source, /"deep bass": 33/);
});

test("arrangement sections expose repeats, energy, copies, and variations without overlapping asset actions", async () => {
  const studio = await readFile(resolve(process.cwd(), "app/studio.css"), "utf8");
  assert.match(source, /setSectionRepeats/);
  assert.match(source, /setSectionEnergy/);
  assert.match(source, /duplicateSection\(section\.id,false\)/);
  assert.match(source, /duplicateSection\(section\.id,true\)/);
  assert.match(studio, /grid-template-columns:minmax\(0,1fr\) 50px 42px/);
  assert.match(theme, /\.project-actions\{bottom:12px\}/);
});

test("the workspace reveals one focused task at a time and fills desktop width", () => {
  assert.match(source, /selectedSectionId/);
  assert.match(source, /sectionPanel/);
  assert.match(source, /className="section-timeline"/);
  assert.match(source, /EditorModeTabs label="Chord workspace"/);
  assert.match(source, /EditorModeTabs label="Drum workspace"/);
  assert.match(source, /is-\$\{workspaceMode\}/);
  assert.match(theme, /\.app-shell\{width:100%;max-width:none\}/);
  assert.match(theme, /\.studio-workspace\{max-width:none;margin-right:0\}/);
  assert.match(theme, /\.section-detail-tabs/);
  assert.match(theme, /\.instrument-mode-tabs/);
});

test("arrangement guidance turns structural critique into reversible actions", async()=>{
  const arrangement=await readFile(resolve(process.cwd(),"packages/workspace/arrangement.ts"),"utf8");
  assert.match(source,/Arrangement check/);
  assert.match(source,/applyArrangementInsight/);
  assert.match(source,/createSectionReturn/);
  assert.match(source,/shapeEnergyArc/);
  assert.match(source,/restoreRemoval/);
  assert.match(source,/Rename \$\{section\.name\}/);
  assert.match(arrangement,/Nothing returns yet/);
  assert.match(arrangement,/The energy curve is flat/);
  assert.match(theme,/\.arrangement-check/);
  assert.match(theme,/\.undo-removal/);
});

test("home omits the duplicate creative-tools directory", () => {
  assert.doesNotMatch(source, /Built for momentum/);
  assert.doesNotMatch(source, /title="Creative tools"/);
});

test("navigation groups related work and becomes an expandable mobile drawer", () => {
  assert.match(source, /label: "Workspace"/);
  assert.match(source, /label: "Preferences"/);
  assert.match(source, /aria-label="Capture"/);
  assert.doesNotMatch(source, /label: "Create parts"/);
  assert.match(source, /className="studio-nav-toggle"/);
  assert.match(source, /studio-nav-backdrop/);
  assert.match(theme, /\.studio-nav\.is-collapsed/);
  assert.match(theme, /\.studio-nav\.is-open\{transform:translateX\(0\)\}/);
  assert.match(source, /Collapse sidebar/);
  assert.match(theme, /@media\(min-width:701px\) and \(max-width:1199px\)[\s\S]*\.studio-nav-collapse\{display:none\}/);
  assert.match(source, /aria-label="Switch part editor"/);
});

test("destructive and system-level project actions are demoted into one options menu", () => {
  assert.match(source, /className="project-options"/);
  assert.match(source, /Project options/);
  assert.match(source, /<TrashIcon \/> Delete project/);
  assert.match(workspace, /\.project-options/);
});

test("projects and recordings retain an offline copy alongside private cloud sync", async () => {
  const storage = await readFile(resolve(process.cwd(), "app/workspace-storage.ts"), "utf8");
  assert.match(storage, /inspitivity-projects/);
  assert.match(storage, /indexedDB\.open\("inspitivity-audio"/);
  assert.match(storage, /\/api\/workspace/);
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
});

test("the app requires a ChatGPT account and scopes every local cache to it", async () => {
  const page = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const auth = await readFile(resolve(process.cwd(), "app/chatgpt-auth.ts"), "utf8");
  const storage = await readFile(resolve(process.cwd(), "app/workspace-storage.ts"), "utf8");
  assert.match(page, /requireChatGPTUser\("\/"\)/);
  assert.match(page, /account=\{\{ userId: user\.userId/);
  assert.match(auth, /oai-authenticated-user-id/);
  assert.match(auth, /email:\$\{email\}/);
  assert.match(storage, /inspitivity-projects:\$\{accountKey\}/);
  assert.match(storage, /inspitivity-legacy-owner-v1/);
  assert.match(storage, /Synced across your devices/);
});

test("projects can be shared with account-bound collaborators", async () => {
  const schema = await readFile(resolve(process.cwd(), "db/schema.ts"), "utf8");
  const api = await readFile(resolve(process.cwd(), "worker/workspace.ts"), "utf8");
  const worker = await readFile(resolve(process.cwd(), "worker/index.ts"), "utf8");
  assert.match(source, /ShareProjectModal/);
  assert.match(source, /Collaborator’s ChatGPT email/);
  assert.match(source, /Everyone with access works on the same project/);
  assert.match(source, /Leave shared project/);
  assert.match(schema, /sharedProjects/);
  assert.match(schema, /projectMembers/);
  assert.match(schema, /sharedRecordings/);
  assert.match(api, /oai-authenticated-user-email/);
  assert.match(api, /Only the project owner can add collaborators/);
  assert.match(api, /sharedRecordingOwner/);
  assert.match(worker, /url\.pathname === "\/api\/shares"/);
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
  assert.match(serviceWorker, /inspitivity-shell-v14/);
  assert.match(serviceWorker, /cache\.delete\("\/"\)/);
});

test("native select values and options remain readable in both dark themes", () => {
  assert.match(theme, /\.app-shell select\{color:var\(--ink\);color-scheme:dark\}/);
  assert.match(theme, /select option\{color:var\(--ink\);background:var\(--surface\)/);
});

test("mobile playback explicitly unlocks and masters the Web Audio graph", () => {
  assert.match(source, /const unlock = async \(kit\?:DrumKit\) =>/);
  assert.match(source, /context\.state === "running" \? Promise\.resolve\(\) : context\.resume\(\)/);
  assert.match(source, /sharedAudioGraph/);
  assert.match(source, /sharedNativeAudioUnlock\.play/);
  assert.match(source, /const diagnostics = \(\) =>/);
  assert.match(source, /Preparing audio/);
  assert.match(source, /createDynamicsCompressor/);
  assert.match(source, /createConvolver/);
  assert.match(source, /engine\.unlock/);
});

test("the home screen can create a coherent playable sketch in one flow", () => {
  assert.match(source, /Start something/);
  assert.match(source, /Quick sketch/);
  assert.match(source, /Empty project/);
  assert.match(source, /Record idea/);
  assert.match(source, /Build playable sketch/);
  assert.match(source, /function buildPlayableSketch/);
  assert.match(source, /Emotive space/);
  assert.match(source, /Neo-soul glow/);
  assert.match(source, /Progressive lift/);
  assert.match(source, /Heavy tension/);
  assert.match(source, /fitMelodyToChords/);
  assert.match(source, /const forms: Record<SketchPreset/);
  assert.match(source, /reinforceDrumAccents/);
  assert.match(source, /sectionPitchContext/);
  assert.match(source, /aria-label="Sketch key"/);
  assert.match(source, /aria-label="Sketch scale"/);
  assert.match(source, /aria-label="Sketch tempo"/);
  assert.match(source, /aria-label="Time signature beats"/);
  assert.match(source, /aria-label="Time signature subdivision"/);
  assert.match(source, /includeMelody/);
  assert.match(source, /includePattern/);
  assert.match(source, /extendedForm/);
  assert.match(source, /preferredForms/);
});

test("existing songs can generate a complete context-aware section", () => {
  assert.match(source, /function buildGuidedSection/);
  assert.match(source, /Generate complete section/);
  assert.match(source, /Add empty section/);
  assert.match(source, /Relationship/);
  assert.match(source, /\["continue","contrast","return"\]/);
  assert.match(source, /generated with the section/);
  assert.match(source, /sectionPitchContext\(previous,"chords"\)/);
  assert.match(source, /generateBassLine\(context,section/);
  assert.match(source, /automaticSectionMix\(section,context\)/);
});

test("arrangement sections expose vertical ordering and a single current length", () => {
  assert.match(source, /arrangement-timeline/);
  assert.match(source, /Move \$\{section.name\} up/);
  assert.match(source, /Move \$\{section.name\} down/);
  assert.match(source, /value=\{section.bars\}/);
  assert.match(source, /<span>Bars<\/span>/);
});

test("arrangement sections own playback and persistent per-track mixing", async () => {
  const theme = await readFile(resolve(process.cwd(), "app/theme.css"), "utf8");
  assert.match(source, /className="section-mixer"/);
  assert.match(source, /mixerChannels/);
  assert.match(source, /DEFAULT_SECTION_MIX/);
  assert.match(source, /mix: \{ \.\.\.section\.mix/);
  assert.match(source, /event\.sectionId/);
  assert.match(source, /\["project", "drums", "chords", "melody", "bass", "riff", "transition", "metronome"\]\.includes\(screen\)/);
  assert.match(theme, /\.project-screen \.topbar,\.inside-project \.topbar\{position:sticky/);
});

test("the supplied Inspitivity artwork is used for navigation and installed-app icons", async () => {
  const layout = await readFile(resolve(process.cwd(), "app/layout.tsx"), "utf8");
  assert.match(source, /<img src="\/icon-192\.png" alt=""/);
  assert.match(layout, /icon: "\/icon-192\.png"/);
});

test("each asset slot opens its typed editor and every section exposes written notes", () => {
  assert.match(source, /SECTION_ASSETS/);
  assert.match(source, /is-created/);
  assert.match(source, /is-empty/);
  assert.match(source, /openSectionTool\(section.id,type\)/);
  assert.match(source, /openIdea\(section.id,idea\)/);
  assert.match(source, /Section notes/);
  assert.match(source, /addSectionNote/);
  assert.match(source, /Lyrics, production or arrangement/);
  assert.match(source, /decodeChordDrafts/);
  assert.match(source, /decodeMelodyIdea/);
  assert.match(source, /Update note/);
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

test("projects can be deleted only after explicit confirmation", () => {
  assert.match(source, /ConfirmProjectDelete/);
  assert.match(source, /Delete project/);
  assert.match(source, /projectToDelete/);
  assert.match(source, /projects\.filter/);
  assert.match(source, /role="alertdialog"/);
});

test("settings expose both persistent app themes", async () => {
  const layout = await readFile(resolve(process.cwd(), "app/layout.tsx"), "utf8");
  assert.match(source, /Black \/ Red \/ White/);
  assert.match(source, /Electric Green/);
  assert.match(source, /localStorage\.setItem\("inspitivity-theme"/);
  assert.match(layout, /inspitivity-theme/);
});

test("part actions retain audition and deletion without competing inline buttons", () => {
  assert.match(source, /className="part-actions"/);
  assert.match(source, /Audition saved part/);
  assert.match(source, /disabled=\{!playable\}/);
  assert.match(source, /Remove part/);
  assert.match(source, /clearAssetDraft\(sectionId,removed,true\)/);
});

test("song and section audition use the saved musical plan without generating missing parts", () => {
  const player=source.slice(source.indexOf("function SharedSectionPlayer"),source.indexOf("function PlayButton"));
  assert.match(player,/buildSongPlan/);
  assert.doesNotMatch(player,/generateChordProgression|generateMelody|generateDrumLoop/);
  assert.match(player,/playbackProject/);
  assert.match(player,/value="song"/);
  assert.match(player,/value="section"/);
  assert.match(player,/inspitivity-song-position/);
});

test("the metronome supports 9/8 projects", () => {
  assert.match(
    source,
    /options=\{\["4\/4", "3\/4", "6\/8", "9\/8", "5\/4", "7\/8"\]\}/,
  );
});

test("the app gives music tools distinct accessible visual identities", () => {
  assert.match(source, /className=\{`app-shell \$\{screen\}-screen \$\{returnToArrangement/);
  assert.match(source, /title="Bass line"/);
});

test("all editors share one accessible transport and its loop setting", () => {
  assert.match(source, /aria-label="Playback scope"/);
  assert.match(source, /checked=\{loop\}/);
  assert.match(source, /<option value="section">Section<\/option><option value="song">Song<\/option>/);
  assert.doesNotMatch(source, /value="part">This part/);
  const editors=source.slice(source.indexOf("function ChordTool"),source.indexOf("function Metronome"));
  assert.doesNotMatch(editors, /<PlayButton/);
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

test("instrument and drum-kit changes hot-swap active playback instead of stopping it", () => {
  const editors=source.slice(source.indexOf("function ChordTool"),source.indexOf("function Metronome"));
  assert.ok((editors.match(/void transport\.refresh\(\)/g)??[]).length>=5);
  assert.doesNotMatch(editors,/label="Instrument" value=\{voice\} options=\{BASS_VOICES\} set=\{\(value\) => \{ transport\.stop\(\)/);
  assert.doesNotMatch(editors,/label="Drum sound"[\s\S]{0,140}transport\.stop\(\)/);
  assert.match(source,/return \{ mode, start, stop, refresh \}/);
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

test("chords, melody, drums, and patterns can add a synchronized project-tempo click while listening", () => {
  assert.match(source, /function scheduleClickTrack/);
  assert.match(source, /checked=\{click\}/);
  assert.match(
    source,
    /scheduleClickTrack\(engine, totalBeats, beatSeconds, project\.meter\)/,
  );
  assert.doesNotMatch(source, /useWorkspaceMetronome/);
  assert.match(source, /metronomeEnabled=\{toolMetronomeEnabled\}/);
  const drumTool = source.slice(source.indexOf("function DrumTool"), source.indexOf("function Metronome"));
  assert.match(drumTool, /scheduleClickTrack\(engine, phraseBeats, beatSeconds, drumMeter\)/);
  assert.match(drumTool, /metronomeEnabled=\{metronomeEnabled\}/);
});

test("melody notes preserve the phrase while pitch and duration are edited by drag", () => {
  assert.match(source, /const beginNoteDrag/);
  assert.match(source, /const dragNote/);
  assert.match(source, /action: "pitch" \| "duration"/);
  assert.match(source, /Drag notes up\/down for pitch/);
  assert.match(source, /note\.duration\.toFixed/);
});

test("melody notes can be selected and edited with a hidden-until-open piano keyboard", () => {
  assert.match(source, /function OnScreenKeyboard/);
  assert.match(source, /aria-label="Two octave piano keyboard"/);
  assert.match(source, /const \[keyboardOpen, setKeyboardOpen\] = useState\(false\)/);
  assert.match(source, /keyboardOpen && <div className="keyboard-panel">/);
  assert.match(source, /chooseKeyboardPitch/);
  assert.match(source, /Remove selected/);
});

test("the melody generator lets writers choose exactly how many notes to generate", () => {
  assert.match(source, /const \[noteCount, setNoteCount\] = useDraftState\("noteCount", Math\.min\(30, defaultNoteCount\)\)/);
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

test("each chord voicing exposes its saved MIDI pitches for direct editing", () => {
  assert.match(source, /const updateVoicingPitch/);
  assert.match(source, /Chord \$\{index\+1\} voicing note \$\{pitchIndex\+1\}/);
  assert.match(source, /addVoicingPitch/);
  assert.match(source, /removeVoicingPitch/);
});

test("desktop, tablet, phone, and narrow-phone layouts have explicit responsive rules", () => {
  assert.match(theme, /@media\(min-width:1200px\)/);
  assert.match(theme, /@media\(min-width:701px\) and \(max-width:1199px\)/);
  assert.match(theme, /@media\(max-width:700px\)/);
  assert.match(theme, /@media\(max-width:480px\)/);
  assert.match(theme, /\.tool-layout\{grid-template-columns:minmax\(0,1fr\)/);
});

test("the progression editor explains each chord's harmonic role", () => {
  assert.match(source, /const chordRole/);
  assert.match(source, /tonic \/ root/);
  assert.match(source, /className="chord-role"/);
  assert.match(source, /Harmonic role:/);
});

test("drum loops are section-aware, editable, and support the expanded kit", () => {
  assert.match(source, /function DrumTool/);
  assert.match(source, /DRUM_INSTRUMENTS\.map/);
  assert.match(source, /Generate new phrase/);
  assert.match(source, /Following this section/);
  assert.match(source, /inferGrooveContext/);
  assert.match(source, /openSectionTool\(section.id,type\)/);
  assert.match(source, /decodeDrumIdea/);
  assert.match(source, /options=\{DRUM_KITS\}/);
});

test("chords, melody, and rhythm ask for a project and section unless opened inside one", () => {
  assert.match(source, /function SaveDestinationModal/);
  assert.match(source, /aria-label="Destination project"/);
  assert.match(source, /aria-label="Destination section"/);
  assert.match(source, /Where should this idea go\?/);
  assert.match(source, /setPendingSave\(\{ type, name, detail, data, voice \}\)/);
  assert.match(source, /Save a copy somewhere else/);
  assert.match(source, /"＋ Choose where to save…"/);
  assert.match(source, /ideas: \[\.\.\.target\.ideas, \{ id: uid\(\), \.\.\.draft \}\]/);
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
  assert.match(source, /openSectionTool\(section.id,type\)/);
  assert.match(source, /openSectionTool\(section.id,type\)/);
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
