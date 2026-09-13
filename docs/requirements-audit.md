# Inspitivity requirements audit — updated 13 September 2026

## Scope and evidence standard

Reviewed the visible conversation backlog, retrievable prior project context, current application, music packages, database/API source, and automated tests. Prior-chat retrieval did not provide an exhaustive transcript of every conversation, including the full “Idea Gathering” chat. This is an evidence-backed audit of available requirements, not a claim that every historical suggestion has shipped.

“Implemented” below means a concrete code path exists. A source contract test is not a user acceptance test. Browser checks used an isolated preview musician and disposable local sketch; real account synchronization, microphone recordings, acoustic quality, physical phones/tablets, and App Store installation were not acceptance-tested in this pass.

## Implemented or refined in this update

| Request | Result | Evidence |
| --- | --- | --- |
| Unify colors across both themes | Central semantic palette; removed fixed color literals from all four component stylesheets and removed per-instrument accent overrides. Neutral surfaces, shared selected states, green play/red stop, amber destructive warnings. Section identity stripes remain purposeful metadata. | `app/palette.css`, component stylesheets, `tests/design-system.test.ts` |
| Missing scales | Added Locrian, ascending/jazz melodic minor, major pentatonic, explicit Ionian and Aeolian aliases. Both project creation and tool selectors use one catalog. Existing saved mode names remain valid. | `SCALE_MODES`, `MODE_LABELS`, theory and app tests |
| Avoid gratuitous diminished harmony | Smooth/balanced generation excludes diminished triads. Correct half-diminished, augmented and minor-major symbols/voicings for intentional modal harmony. Advanced extensions selected for compatibility with the scale. | `generateChordProgression`, `chordIntervals`; generated chord tones tested across all modes and 12 roots |
| Always-available “Play current section” | Fixed bottom workspace transport in Arrangement and all project tools, including Transitions and Metronome. Responsive safe-area clearance, accessible section selector, progress and expandable track mixer. | `SharedSectionPlayer`; shared `draftSectionId`; layout contract tests; desktop browser scrolling check |
| Remember current section when returning from editors | Arrangement and the transport now share the same section selection. | `ProjectView` controlled selection; preview workflow |
| Creative chord strum rhythms | Seeded offbeat starts, anticipated entries, rests, variable attack durations/velocities and alternating stroke direction. Adaptive generation responds to kick/snare positions. Sustain, offbeat, syncopated, driving and sparse directions remain available. New rhythm preserves chord pitches; rhythm locks preserve existing events. | `chord-rhythm.ts`, ChordTool rhythm inspector, generated sketches and section variations |
| Rhythm survives saving and export | Optional fourth serialized field, backward-compatible legacy decoding. Shared event expansion used by tool, asset, section, arrangement and MIDI paths. | `chordNoteEvents`, `buildSongPlan`, `tests/chord-rhythm.test.ts` |
| Play icons readable and consistently colored | SVG play/stop icons replace platform-dependent emoji rendering. Bass secondary playback also uses the shared control. | `PlayButton`, BassTool |

## Existing requests with implementation evidence

| Request | Evidence / qualification |
| --- | --- |
| Same saved projects across devices for one account | `app/chatgpt-auth.ts`, account-scoped cache/sync, `worker/workspace.ts`, `db/schema.ts`; API tests cover identity boundaries and persistence. Not verified with two real signed-in devices in this pass. Unsaved drafts intentionally do not sync. |
| Project deletion | Confirmation flow, account workspace update, deletion handling. This pass did not delete user projects. |
| Supplied icon | `public/icon-192.png`, app metadata and navigation image. |
| Sticky Back and project/tool title | Sticky topbar across arrangement and project tools; observed while scrolling the chord editor. |
| Drums with metronome | Shared project-tempo click toggle and sequencing; source and timing tests. |
| Per-section mixer, mute/solo and automatic balance | `sectionMix`, `automaticSectionMix`, persisted `mix`; bass included. Automatic balance is a musical heuristic, not measured LUFS normalization. |
| Real bass generation | Seeded generator in `packages/workspace/bass.ts`; five names are generation directions, not five fixed loops. Harmony, kick and activity context are inputs. |
| Low five-string bass range and editable bass notes | MIDI B0–G3 generation, bass event editor, layered dry synthesized electric-bass voice. Audible realism remains a listening/acceptance question; no sampled electric-bass library. |
| Context-sensitive melody, chords, bass and drums | Section harmony/pitch/activity helpers; supported generation and variation tests. These are algorithmic heuristics, not a language-model composition service. |
| Section copy vs variation | Separate actions; seed-driven data changes. Chord variations now also vary rhythm, including a one-chord part. |
| Section notes | Notes tab; create/edit notes per section. |
| Voicing notes and optional keyboard | Chord MIDI-pitch editor; melody selection/pitch/duration editing and collapsible on-screen piano. Keyboard keys are only rendered when activated. |
| Arrangement workflow | Section timeline, selected-section Parts/Mix/Notes, repeats, meter maps, energy, rename, up/down order, copy/variation, song check and undo for removals. |
| Responsive navigation and full-width desktop | Desktop expanded/collapsible sidebar, tablet icon rail, phone drawer; full-width workspace; explicit 1200/900/700/480 layouts. Real-device testing remains outstanding. |
| Play/trash collisions | Separate grid columns and touch targets in asset tiles. |
| Remove obsolete copy / duplicate Creative tools directory | Absent; source regression checks. |
| Compact project actions | Icon-only Record/Delete with accessible labels; no duplicate bottom navigation. Actions stay in document flow above the pinned transport. |
| White select text | Shared foreground/background tokens and native dark color scheme across forms and option menus. |
| Backup, recording and MIDI | Complete backup/restore as copies, recording storage, per-part and multitrack MIDI; unit/API tests. No microphone capture in this pass. |
| Published stable URL | This project keeps the original Site identity and URL. Deployment success is reported separately, only after confirmation. |

## Still partial, unverified or not implemented

1. **Visual playback: implemented for the primary editors.** Chord highlighting, drum-step highlighting with optional bar following, and melody/bass/pattern cursors consume audio-clock positions from solo and current-section playback. Arrangement elapsed time now uses the audio clock. Chord highlighting indicates the harmonic region, not each individual strum. Device latency and background-tab acceptance remain unverified.
2. **True pause/resume: current-section player implemented.** Its Pause suspends the shared audio clock, retaining source/envelope positions; Play resumes. A separate Stop/rewind resets the section. Solo instrument and full-song transports still use Stop, not resumable pause. Cross-device browser audio acceptance remains outstanding.
3. **Focused editing: implemented.** Chord editing shows one selected voicing while keeping the progression overview available. Adding a chord selects it. Phone drum editing exposes a single selectable lane; desktop/tablet retain the full grid. Real-device usability remains unverified.
4. **Arrangement drag reordering / duration-proportional timeline.** Up/down reordering exists. Timeline tiles are not duration-proportional drag blocks.
5. **Audio consistency and bass realism.** Defaults, gain staging, compressor and heuristic auto-balance exist. No measured perceptual-loudness normalization, audio golden-master tests or sampled five-string bass.
6. **Cross-device acceptance.** Server ownership/sync is implemented and API-tested; a real two-device signed-in save/edit/conflict/recording round trip remains unverified. The local QA identity does not authenticate to production; its session warning is not evidence of a production outage.
7. **Native iOS release / user-owned GitHub remote.** Current deliverable is the hosted web app/PWA and Sites-backed source repository. No native App Store package or separate user GitHub publishing is verified.
8. **AI/Easy Mode and full prior-chat idea list.** Guided playable sketches and algorithmic interdependent generation exist. No new AI service was added. The complete unseen “Idea Gathering” specification cannot be marked complete.
9. **Full accessibility and physical-device acceptance.** Semantic palette contrast checks and responsive source contracts are not a full WCAG audit or a substitute for screen-reader, 200%-text and physical mobile testing.

## Verification performed

13 September continuation: TypeScript and 120 automated tests passed, including musical-clock wrapping, held paused positions, chord boundaries, and wiring contracts for pause/reset and focused editors. These are unit/source checks, not browser audio acceptance tests. No new real-device or authenticated sync acceptance was performed. Production build is required before publishing this continuation.

- TypeScript check and the complete unit/API/source-contract suite.
- Semantic foreground/background contrast: at least 4.5:1 for tested normal-text pairs and 3:1 for tested meaningful control boundaries in both themes. Prevent new fixed component palettes and self-referencing color tokens.
- All catalog modes in 12 roots: melody membership and generated chord-tone membership; pentatonic harmony tested against its documented parent scale.
- Rhythms: repeatable seeds, diversity, anticipations, non-downbeat entries, short/odd/compound meters, drum context, persistence/legacy behavior, and section-plan parity.
- Desktop preview: both themes, project creation, Arrangement → Verse → Chords continuity, rhythm change from 22 to 25 attacks, current-section start/stop and continued visibility after scrolling, mixer discovery and overflow refinement.
- Production build required before publication. No production projects or account permissions changed by QA.
