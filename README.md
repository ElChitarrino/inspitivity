# Inspitivity

Inspitivity is a local-first songwriting workspace for chords, drums, bass, melodies, patterns, recordings, and section-based arrangements. Saved projects and recordings sync under the signed-in ChatGPT account through the Site's database and recording storage. Each device keeps a working copy; unsaved instrument drafts and appearance preferences stay device-local.

## Install on a phone

- iPhone or iPad: open the hosted site in Safari, tap **Share**, then **Add to Home Screen**.
- Android: open the hosted site, open the browser menu, then choose **Install app** or **Add to Home screen**.

The installed web app opens full-screen. Its cached shell and local working copies support offline use. Cloud synchronization requires a valid account session and a connection. This is a PWA, not a native App Store app.

## Design and music behavior

- `app/palette.css` is the sole source for interface color values. Both themes share semantic roles: theme accent for selection, green playback, red stop, amber destructive warnings, and neutral editing surfaces.
- `SCALE_MODES` in `packages/music-theory/index.ts` drives both new-project and editor scale selectors. Melodic minor means the ascending/jazz form; Ionian and Aeolian explicitly alias major and natural minor. Pentatonic harmonization uses its diatonic parent scale.
- Chord data remains backward compatible: `symbol|beats|voicing-pitches|rhythm-attacks`. The optional fourth field stores semicolon-separated `start,duration,velocity,upstroke` events. Old three-field chords retain sustained playback until the user changes their rhythm.
- `packages/music-theory/chord-rhythm.ts` supplies the same strummed-note events to instrument audition, current-section preview, arrangement playback, and MIDI export.
- The project transport is pinned above the bottom safe area, with an expandable mixer and shared section selection.

See [the requirements audit](docs/requirements-audit.md) for evidence, remaining work, and verification limits.

## Run locally

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Then open the address shown in the terminal.

## Commands

- `npm run dev` — start the local app
- `npm run build` — create a production build
- `npm test` — run the music and workflow tests, then build
- `npm run lint` — check the code style

## Project structure

- `app/` — the songwriting workspace and styling
- `packages/music-theory/` — scale, chord, and melody generation
- `packages/sequencing/` — musical timing and loop helpers
- `tests/` — automated feature and music behavior checks

## GitHub upload

Create an empty GitHub repository, then upload the contents of this folder (or the provided source archive). Do not include `node_modules`, `dist`, `.test-dist`, or `.wrangler`; they are already excluded by `.gitignore`.
