# Audio, arrangement and responsive verification — 13 September 2026

## Delivered

- Bass uses a plucked-string harmonic spectrum calibrated by sampling one period (RMS 0.45, peak ceiling 0.9 before the processing chain). Fundamental and body oscillators share tuning, removing detuned low-frequency beating. Reduced drive, softer pickup transient, velocity-sensitive brightness and a decaying sustain replace the previous brighter three-waveform blend. This remains synthesized bass, not sampled electric bass.
- Automatic balance now considers event velocity, duration, polyphony and voice weighting. It conservatively attenuates dense layers, never boosts silence, and applies to newly generated sketches/sections and explicit balance actions. Existing saved mix settings are retained until a balance/energy action. This is activity estimation, not LUFS normalization of rendered audio.
- Arrangement tiles scale with actual transport duration, including meter maps and repeats. Drag grips use pointer events with edge scrolling and cancellation. Alt+Left/Right and existing Up/Down controls provide keyboard/button alternatives. Reordering preserves section IDs/content and stops old playback. Audio plans and arrangement analysis are memoized rather than rebuilt on every elapsed-time update.
- Mobile menu and Back controls have separate space. Returning from project instruments retains the selected section. Tablet project settings wrap rather than pushing the Click control beyond the screen. Bass note audition uses a theme-colored SVG.

## Verification performed

126 tests passed, including bass waveform headroom/fundamental, duration ratios, bidirectional immutable section reordering and conservative activity compensation. TypeScript passed.

Cloud Chrome preview with a disposable local sketch:
- Mouse drag and Alt+Right reordered sections successfully; data persisted into a subsequently opened preview frame.
- Four-bar tile measured ~165.3 px; eight-bar tile ~330.6 px.
- Current-section playback entered running and paused states; individual bass audition was invoked. No application errors appeared in captured error logs (browser-extension errors excluded). This establishes control/runtime behavior, not an audible glitch-free result.
- Phone layout used a 390 px iframe (375 px content after browser scrollbar); arrangement, drums, bass and chords ended with document scroll width equal to client width. Phone drawer opened/closed, drum lane selected Snare, and expanded mixer fit.
- Tablet used a 768 px iframe (753 px content). A real 22 px overflow from the project Click control was found and fixed; bass and chords then fit.
- Desktop chord layout used a 1280 px iframe (1265 px content) and fit.
- Mobile Back button measured x=72..114 px, separated from the x=12..58 px menu button. Back navigation from drums returned to arrangement.

The temporary same-origin iframe fixture was removed before publication. Width-constrained Chrome frames test responsive CSS; they do not emulate Safari, touch hardware, device pixel ratios or device audio drivers. Physical iOS/Android audio, Bluetooth, microphone capture, locked-screen playback, full screen-reader/zoom acceptance and authenticated two-device sync remain unverified. No production account/project data was used for QA.
