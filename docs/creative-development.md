# Creative development release

## User flow

Open a project, select a section, and use **Develop & vary** above its part tabs.
Lock the tracks to retain, generate a variation, and compare A (saved original)
with B (candidate). Comparison auditions the selected version. Nothing is saved
until **Keep variation**. Closing, Escape, outside-click, and **Keep original**
leave the saved project intact.

**Build a related section** offers quieter verse, stronger chorus, contrasting
bridge, and theme return. These are full-section transformations; track locks
apply to the variation controls, not the section-development actions. A candidate
is inserted after the source only when accepted. Missing foundational parts are
generated from its harmonic context.

Easy Mode separates genre, emotional direction, and intensity. Emotional
directions have three deliberate harmonic arcs each, contrasting melodic mood
and density, and different chord rhythm. Direction selection suggests a scale;
manual key/scale changes remain available. Surprise chooses compatible scales.

## Musical invariants

- Locked tracks, alternate takes, recordings, written notes, and mix settings are
  retained in selective variations. Only the active take is changed.
- Locked bass, melody, or riff anchors chord roots and harmonic duration.
  Unlocked harmony can still change voicing and attacks.
- Unlocked bass follows chord changes and kick positions. Strong lead attacks
  use chord tones; weaker positions retain passing-note freedom.
- Verse and chorus retain the source chord sequence and opening melodic cell.
  Bridge rotates related harmony and refits accompaniment to the final order.
- Explicit `cycleBeats` keeps melodic/riff repetitions aligned after rhythmic
  changes and preserves final rests. Existing projects without it retain their
  previous playback behavior. Manual note edits clear obsolete cycle metadata.
- Section lengths, meter maps and existing voices are retained.

## Sound changes

Pad, glass, pluck, pulse and flute use distinct partials, envelopes, sustain,
release and room routing. Pad has restrained stereo spread; glass overtones have
individual decay; pluck is short and dry; pulse has a resonant, sustained tone;
flute develops gentle vibrato. Voices use at most four main oscillators.

Existing recorded guitar/drum assets and their licenses are retained. Sample
attack RMS is calibrated once per decoded buffer, with bounded gain and peak
headroom. This is attack-level compensation, not LUFS normalization. Recorded
drums retain their kit-specific bank/profile, velocity layers and alternate takes;
soft hits have less high-frequency energy. Sound editors include a direct preview.

## Verification

Unit/integration coverage exercises every lock combination, source immutability,
alternate takes, anchor harmony, strong-note fitting, related-section identity,
single-part foundation completion, odd/mixed meters, saved phrase boundaries,
all-key emotional harmony, direction diversity, instrument-envelope ordering,
sample calibration, and existing sample-bank selection/caching.

Mobile styles reserve touch targets, wrap controls, keep the preview inside the
dialog and allow scrolling. The dialog traps keyboard focus and returns focus to
the opener. English/German text is included. Physical-device layout and listening
QA have not been performed in this environment; subjective quality requires
listening with speakers/headphones and representative user feedback.
