# Code maintenance

## Responsibility boundaries

| Location | Responsibility |
| --- | --- |
| `app/InspitivityApp.tsx` | Workspace navigation, project editing, and legacy instrument editors |
| `app/components/section-creative-dialog.tsx` | Variation controls, comparison state, focus management, and saving a chosen candidate |
| `app/components/sound-editor.tsx` | Instrument selection and cancellable sound audition |
| `app/components/select.tsx` | Accessible labeled select and display names |
| `app/audio/use-audio-engine.ts` | React lifetime for an engine's scheduled sources |
| `packages/sequencing/audio-engine.ts` | Browser output graph, instrument rendering, source tracking, and lookahead scheduling |
| `packages/workspace/section-development.ts` | Seeded variation and related-section development |
| `packages/workspace/section-context.ts` | Key normalization, meter lengths, and chord-cycle lookup |
| `packages/workspace/idea-codecs.ts` | Note/chord serialization and malformed-note filtering |
| `packages/workspace/section-mix.ts` | Saved mix snapshots and automatic musical balance |

Domain code must not import React components. The creative dialog receives its preview renderer from the workspace, so it does not import the app that hosts it. Generation accepts seeds and an ID factory rather than hiding random choices in helpers.

## Generation flow

`varySection` selects the first take of each musical layer, varies harmony and drums, then derives bass and refits lead notes against the resulting harmony. Locked tracks, alternate takes, recordings, text, and saved mixer values are preserved. The source section is never mutated.

`developSection` fills missing foundational parts, varies the foundation, applies verse/chorus/bridge/return treatment, and refits bridge notes against the final chord sequence. Helpers name these operations explicitly. Harmony lookup decodes the cycle once per transformation.

Note encodings retain their existing formats. Melody uses `label|start|duration|MIDI`; bass and riff use `MIDI|start|duration|...metadata`. Codec edits preserve trailing accent, mute, and extension fields. Chords use `symbol|beats|pitches|attacks`; old detail-only chords remain supported.

## Audio ownership

Engines share the browser's master output graph, but each engine owns its sources and delayed queue. `stopAll` cancels both; unmounting an owning component also stops its engine. Invalid or silent notes do not allocate audio nodes. Acoustic drum kits use their sample banks; only the electronic kit enters the synthetic percussion path.

## Checks

```sh
npm run test:unit
npx tsc --noEmit
npm run lint:refactored
npm run format:check
npm run build
```

The new audio tests use a small Web Audio stub to test scheduling, ownership, invalid input, and source cleanup. They do not establish sound quality or Safari hardware behavior. Musical integration tests run generation through song-plan construction and check musical invariants, deterministic results, and input immutability.

Prefer behavior assertions and invariants over matching exact source text. Some older UI contract tests still inspect source strings; replace these incrementally with component/browser coverage when that test infrastructure is available. Do not rewrite expected musical outcomes merely to make a refactor pass.

## Remaining work

The main app still contains large legacy editors, and whole-tree lint still reports existing React effect and accessibility issues. `lint:refactored` covers the modules maintained in this pass without relaxing those rules. Generated model bundles and compiled test output are excluded from whole-tree lint. Further extraction should move one editor at a time, with saved-project and transport behavior covered before changing its state model.
