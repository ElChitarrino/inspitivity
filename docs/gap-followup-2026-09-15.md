# Gap follow-up — 15 September 2026

## Implemented

- Bounded future-voice scheduling at the audio-engine entry points, covering solo instruments and metronome clicks as well as asset previews. Stop clears scheduled work. Suspended contexts are not resumed by the queue timer; expired notes are skipped instead of burst-played.
- Recorder unmount releases microphone tracks and removes handlers, including when permission resolves after the modal was closed. Startup failures and recording errors release tracks. Stop releases the microphone before asynchronous storage. Save failures retain the captured blob in the open modal for retry; empty recordings show an error. Existing browser-selected MIME types are preserved.

## Requirements audit evidence

Existing tests cover bass generation diversity and kick interaction, pitch-context harmony, diminished-chord defaults, variation versus copying, editable voicing persistence, and chord-rhythm diversity/export. The mode selector filters legacy major/minor aliases while preserving old saved data. These requests have implementation evidence, not merely backlog promises; no replacement implementation was needed in this pass.

## Limits

Queue behavior has deterministic tests; recorder lifecycle wiring has a source contract check, not a real microphone test. No browser or physical-device audio benchmark, acoustic listening assessment, real microphone capture, or two-account/device synchronization acceptance was performed. Full loop scheduling on the audio clock, complete accessibility acceptance, native iOS release, GitHub parity, and comparison against the complete separate UX proposal remain outstanding. Captured audio awaiting retry is held only while the recorder stays open, not durably backed up until saving succeeds.
