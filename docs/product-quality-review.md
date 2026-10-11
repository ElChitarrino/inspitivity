# Product and sound quality review — 7 October 2026

## Current position

Inspitivity is a useful editable sketch workspace, with linked harmony, bass and drums, section development, recordings, MIDI export, and deterministic variations. It is not yet a convincing virtual band. The existing drums and guitar sounds use recorded samples; bass and the named synth sounds are synthesized. Several acoustic kit choices are processing profiles of shared recordings, not separately recorded kits. Local AI currently classifies a theme; it does not compose a band arrangement or understand an unrestricted musical brief.

The sound-loading improvement remains in place. Its sub-five-second timing was measured under simulated network/decode conditions, not on physical phones. Sound-quality claims require listening tests.

## Implemented in this revision

- Easy Mode accepts a song brief and explicitly applies recognized style, emotion, intensity, tempo, meter, key/mode, and part exclusions. It shows recognized settings and saves the original brief as a section note. Unknown prose does not pretend to yield a semantic interpretation. Explicit key/mode choices override preset defaults.
- Organic fusion uses a warm harmonic bed, recorded acoustic guitar lead and electric-style bass. Easy Mode no longer automatically inserts an 808/sub-bass sound into acoustic genres. Existing projects keep their selected instruments.
- Generated leads leave space at two-bar phrase boundaries, retain articulation dynamics in saved data and playback/MIDI, and avoid overlapping monophonic notes. Their explicit cycle retains the final rest when looping.
- All distorted Easy Mode chord parts use root/fifth/octave voicings rather than driving dense extended chords through sampled distortion. Rich harmonic color remains available in softer chord sounds.
- Short synthetic notes have shorter releases, and additive partial gain is bounded by total amplitude. Recorded distorted guitar receives a low-cut to reserve the deepest register for bass and kick.

## Next priorities

1. **Reference-based listening acceptance.** Establish short mellow-fusion, rock and heavy sketches and listen on headphones, a laptop, and a phone. Check harshness, bass audibility, drum balance, onset timing and mono playback. Compare the same saved material before and after changes, rather than comparing different random drafts. Automated musical invariants do not prove emotional quality.
2. **Better source instruments.** Add a properly licensed, compact clean electric guitar and electric piano bank, followed by recorded electric bass. Keep core downloads small and stream optional takes. The present acoustic guitar is classical guitar; the electric-style bass remains synthesis. Do not label those as premium studio instruments.
3. **A richer shared musical plan.** Store a hook, rhythmic motif, harmonic destinations and an arrangement energy curve. Make verse/chorus development transform that plan by one or two deliberate changes, with instrument register separation. Retain user edits and locks. Avoid adding independent per-track randomness.
4. **Input fidelity.** Add explicit supported requests for harmonic motion, rhythmic feel, register and arrangement arc; then use the local model to map text to a validated structured plan. Display applied constraints and keep deterministic fallback. Audio/MIDI input and transcription need a separate workflow and device budget.
5. **Rendered-audio regression checks.** Use offline audio rendering for onset discontinuities, peak/headroom, mono sum, note lifetime and repeatability. Add physical Safari playback acceptance. Current Web Audio mocks verify ownership and scheduling, not the heard output.

These are priorities, not claims of implemented features. Phrase development follows the general repetition/variation and melodic-contour approaches in Ableton's Making Music: https://makingmusic.ableton.com/creating-variation-2-mutation-over-generations and https://makingmusic.ableton.com/creating-melodies-1-contour . Emotional labels are compositional heuristics, not objective guarantees about a listener's response.

## GitHub synchronization

Before this revision, GitHub main was at 13 September while the hosted app was version 97. GitHub synchronization was attempted, but the connected integration returned HTTP 403, Resource not accessible by integration, for Git blob writes. Repository metadata reports the user can push; the integration itself still needs Contents write permission. GitHub main remains unchanged. A source bundle is provided for manual synchronization if needed. Generated local-model bundles are reproduced by the build and are excluded by .gitignore. Publication and GitHub synchronization are separate operations; success is reported only after each operation completes.
