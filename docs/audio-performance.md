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


## 4 October: sample startup

The previous acoustic path downloaded 12,424,220 bytes in 32 individual WAV requests, decoding in four request/decode workers. Rock/metal then waited for the entire second kit, followed by each requested guitar bank in sequence. Native HTML audio unlock also blocked downloads.

Startup now fetches one versioned binary pack per required bank and downloads banks concurrently with AudioContext resume. Acoustic hits use 192 kbps stereo MP3 derivatives with gapless metadata; source WAVs and attribution remain included. Both velocity layers, every mapped guitar note, and the selected drum bank are ready before playback. Only alternate takes wait until afterward, using the already loaded first take until they arrive. Rock/metal-only plans need their own bank plus acoustic crashes. Plans using both acoustic and metal still load both.

The acoustic startup pack is 872,340 bytes (93.0% less than the previous complete WAV bank). A song using both drum banks and both guitar instruments needs 2,511,874 startup bytes across four requests, versus 14,554,347 bytes across 106 requests previously. Loaded buffers are reused per AudioContext; versioned packs use a persistent cache-first service-worker cache rather than downloading again on every play. Failed attempts preserve decoded samples for retries. Each pack has a 4.5-second fetch/decode deadline; decode timeouts reject instead of leaving the Play control pending. This deadline is an error bound, not a promise that offline/slow connections will produce audio.

### Controlled benchmark

`npm run benchmark:audio` exercises the real loader and packaged assets with a simulated single shared 5 Mbps connection, 150 ms request latency, and 8 ms simulated decode per sample (four concurrent decodes per bank). Measured in this execution environment:

| Scenario | Cold load | Same-context repeat | Startup requests |
| --- | ---: | ---: | ---: |
| Acoustic drums | 1,584 ms | <1 ms | 1 |
| Metal + classical + distorted guitar | 3,205 ms | <1 ms | 4 |
| Both drum banks + both guitars | 4,212 ms | <1 ms | 4 |

This is a controlled loader benchmark, not a Safari/iPhone, audio-quality, or production-CDN measurement. Actual decoder performance, network throughput, latency, and device memory vary. Sub-5-second startup cannot be guaranteed on arbitrary connections. The benchmark fails if any of these scenarios exceeds 4.5 seconds or repeat playback downloads again.

Regression tests cover pack bounds and duplicate keys, concurrent-load deduplication, decode retries, deferred takes with retained velocity layers, selected-bank requirements, metal crash coverage, and stalled decoder timeouts. Existing recorded-kit and alternate-take tests continue to pass.
