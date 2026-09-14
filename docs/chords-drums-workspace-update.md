# Chords, acoustic drums and workspace refinement

Implemented September 14, 2026.

- Chord rhythms: one attack per chord, quarters, eighths, offbeats, backbeats, 3–3–2, and generated adaptive/syncopated/driving/sparse variations. Apply globally or per chord; serialized attacks remain the playback and MIDI source.
- Selectors show Ionian and Aeolian rather than duplicate Major and Minor entries. Existing saved aliases remain valid.
- Acoustic drums: 32 credited recordings, eight pieces, two strengths and two alternating takes. Six processing presets use one sampled kit; the original electronic synthesis remains available. New sketches use acoustic kits. Existing explicit kit selections are preserved.
- Samples load once per AudioContext, with four concurrent downloads and bounded timeout. Playback waits for the complete bank and reports failures. Preparation removes leading silence, fades boundaries, resamples, then limits PCM peaks. One silent upstream soft kick was replaced with a verified alternate take.
- UX follows the retrieved September 13 discussion: Project → Section → Part, persistent transport with Section/Song/This part scope, compact section strip and part rack, contextual part actions, collapsible settings/variations, and Generate/Edit across the five instruments.
- Song and section playback now share a scheduler and per-section mixes. Count-in, click, looping, pause and rewind live in the persistent transport. Duplicate editor play bars were removed. Saved-part audition remains in each part's actions menu.
- Pattern note editing now exposes pitch, timing, duration and accents. Existing melody keyboard and bass/chord editors remain available in Edit.

Validation: 133 automated tests passed, including explicit rhythm timing, legacy aliases, saved kit validation, all packaged PCM files, sample-bank reuse, velocity/take selection and non-destructive playback scopes. TypeScript passed. Physical-device playback, perceptual listening, and visual browser checks were not performed for this update; these results do not establish commercial-library sound quality or real-device performance.
