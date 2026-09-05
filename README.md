# Inspitivity

Inspitivity is a local-first songwriting workspace for creating chord progressions, melodies, recordings, and section-based arrangements. Project data stays in the browser on the device.

## Install on a phone

- iPhone or iPad: open the hosted site in Safari, tap **Share**, then **Add to Home Screen**.
- Android: open the hosted site, open the browser menu, then choose **Install app** or **Add to Home screen**.

The installed app opens full-screen. Its app shell remains available offline, while projects and recordings stay in local browser storage on that device.

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
