# Independent chord explorer

## Design review

The prior interface used the brand accent for most tool states, while the explorer inherited song controls, draft-saving copy, and project context. Its sidebar and Create menu both exposed the same tool. Those cues incorrectly suggested it was a project part editor.

The updated explorer has one primary navigation location between Projects and Metronome. Create new remains for projects, recordings, and parts. Capture is removed from the sidebar. Explorer state and generation do not read, write, or preview a project.

| Guideline | Previous Inspitivity behavior | Change |
| --- | --- | --- |
| Consistency and recognition | Tool color identity mostly disappears inside editors | Stable accent on tool header and result surface; harmony violet, rhythm amber, bass blue, melody coral |
| Color must not be the only cue | Icon and label navigation already exists | Keep labels/icons and add a selected-edge marker; color supplements them |
| Contrast | Existing theme palette has readable neutral text | Reuse palette tokens; test normal text and accent contrast against three surfaces in both themes |
| Visible system status | Generic model failure; generation disabled while loading | Separate model status, progress, retry/stop, timeout, visible interpretation; instant generation remains enabled |
| User control | Key/mode buried in song settings | Visible independent key/mode with Auto; fixed selections survive generation; previous idea restores the full result |

The brand accent remains the primary action color. Tool colors are reserved for identity, not success/error states. Avoid giving every button a different color. The accent family can be extended to part badges later, but this update does not recolor the whole arrangement.

Sources consulted 2026-09-30:
- https://www.w3.org/WAI/WCAG22/Understanding/use-of-color
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html
- https://www.nngroup.com/articles/consistency-and-standards/
- https://www.nngroup.com/articles/gestalt-similarity/

## Generation and AI boundary

Each of six feelings has six phrase-level harmonic arcs. Auto chooses among musically related modes; manual key and mode override it. Seeded selection varies harmony, extensions, voicing and rhythm while notes remain compatible with the displayed chord and harmonic scale. Pentatonic selections use their parent diatonic harmony.

On eligible desktops, Qwen2.5-0.5B (8-bit, about 520 MB including tokenizer) runs in a dedicated WASM worker after explicit opt-in and model download. Phones, tablets (including iPadOS desktop identity), and desktops reporting less than 8 GB of memory receive multilingual MiniLM-L12 (8-bit, about 140 MB including tokenizer) instead. Compact inference matches a normalized sentence embedding against six musical mood descriptions, using one short input at a time with a 64-token limit. Ambiguous similarities preserve the instant result. This is semantic matching, not a text-generating LLM. The compact branch returns before any Qwen pipeline is instantiated; the worker fixes its profile on initialization. No automatic fallback loads the bigger model.

Both profiles interpret a semantic mood; the music-theory engine creates the actual voicings. Explicit mood and genre cues override contradictory model suggestions. The instant keyword-based path is a fallback, not represented as model output. Generation IDs prevent outdated model replies overwriting newer input or manual choices. Interpretation remains approximate, not expert musical reasoning. Worker termination releases its model when the explorer closes, the user stops AI, or the app goes into the background. Download size is not peak memory usage.

Compact model native-runtime smoke checks matched twelve English and German descriptions to their intended six categories. This verifies model compatibility and these examples, not iPad Safari stability. Hardware testing is still needed; no peak iPad memory claim is made.

The worker is bundled separately from Vinext because framework page transforms incorrectly imported DOM-dependent dev overlay code into the worker. Preview and production serve the same isolated worker artifact. WASM uses one thread and does not require cross-origin isolation.

An explicit token-prefix grammar restricts model output to the six supported mood labels. This prevents translation, prose and prompt echoes; the model's token probabilities still determine which label is chosen. Semantic accuracy is not guaranteed by the grammar. The user can always override the category with a mood chip.

Automated coverage includes all selectable modes across representative keys and every feeling, deterministic generation, diversity with locked harmony, MIDI-compatible note events, loading queues, stale responses, invalid replies, failures, timeout, retry, navigation boundaries, isolated worker build, and palette contrast. These checks are not a claim of complete WCAG conformance or subjective musical quality.
