# Playback performance investigation — 2026-09-13

Source inspection found full-arrangement playback allocating all future voices at startup, per-hit generation of noise buffers, per-note waveshaper curve construction, and editor-wide updates at 40 Hz. These are plausible contributors to reported glitches; the user's exact idea/device was not profiled or audibly reproduced.

Changes:
- Arrangement notes and metronome now schedule through a 200 ms window with a 25 ms timer and 80 ms startup lead. Late events beyond 20 ms are skipped rather than burst-played.
- Current-section lookahead increased from 120 to 200 ms.
- Drum noise buffers and distortion curves are cached per engine. Guitar oversampling is reduced from 4x to 2x to reduce processing cost (a small potential timbre change).
- Finished tone and percussion graphs explicitly disconnect. Shared mastering remains connected.
- Drum/chord editor updates follow sixteenth-note steps; arrangement time updates at tenths of a second; section progress updates at percentage steps. Dedicated note cursors retain their smoother updates.

Validation: 122 unit/source-contract tests and TypeScript checks passed, including a 30,000-event, five-layer scheduling simulation and stalled-clock recovery without duplicate events. This is not a browser DSP benchmark or physical-device listening test.

15 September follow-up: solo editors, asset previews and their clicks now keep future events in an audio-clock queue rather than allocating every future voice up front. Only events within 200 ms create audio nodes; queued events are cleared on stop and expired events are skipped after stalls. The queue does not resume a suspended context. Deterministic tests cover a 1,000-event phrase, cancellation, suspended-clock behavior and stall recovery. This reduces startup allocation pressure; it is not a measured device-performance result.

Remaining limitations: solo and full-song loop restarts still use a wall-clock timer; background-tab timer throttling can exhaust the lookahead. No guaranteed background/screen-locked playback or measured glitch-free device claim is made.
