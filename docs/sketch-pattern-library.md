# Easy Mode: genre variety without losing the song

## Problem and change

Previously, acoustic sketches defaulted to 88 BPM in 6/8 and offered three similar rolling drum patterns. Mellow energy randomly removed most offbeat hats. Emotional direction also replaced each genre's harmony and chord rhythm with one shared three-progression palette. This made otherwise different genres and seeds converge on similar results.

Acoustic sketches now start at 104 BPM in 4/4. Surprise chooses compatible tempo/meter families: straight 4/4, rolling 6/8 and waltz 3/4, including gentle and lively tempos. Generate retains the settings currently shown. Mellow controls dynamics and phrase space while retaining the chosen groove's subdivisions.

Genre-specific schemas remain authoritative. Mood weights compatible schemas within the genre; it no longer discards the genre vocabulary. Chord attacks, harmonic timing, bass direction and melodic rhythm add independent but bounded variation. Four chord-duration patterns each total four bars, allowing both held harmony and faster turnarounds. Return sections retain the theme's harmony and chord rhythm.

## Musical vocabulary

| Style | Harmony families | Groove families |
| --- | --- | --- |
| Acoustic | Singer-songwriter, doo-wop, hopscotch, plagal, minor lament and minor circle | Soft backbeat, boom-chick, strumming pocket, offbeat lift, sixteenth motion, shuffle, 6/8 and waltz |
| Rock | Anthem, tonic/fourth vamp, plagal/modal return, rising refrain | Straight backbeat, anticipations, double kick, four on the floor, shuffle and sixteenth motion |
| Soul | Major ii–V–I root movement, turnarounds, descending colours and modal vamps | Laid-back backbeat, half-time shuffle, sixteenth conversation and broken-beat pickups |
| Funk | Tonic and two-chord vamps, modal response and turnarounds | Syncopated kicks, ghost strokes, sixteenth hats and two-bar answers |
| Progressive | Modal journey, mediant movement, fourth cycles and pedal harmony | Odd-meter groupings, straight fusion, half-time, sixteenth accents and shuffle |
| Heavy | Pedals, dark modal steps, minor lift and plagal responses | Straight drive, half-time breakdown, gallop, staggered accents and odd-meter pickups |

Templates store their source meter explicitly. Custom meters adapt the selected style's vocabulary. A shared groove clock delays matching offbeats in drums, chord attacks and bass; shuffle hats use actual triplet positions. Late snare placement remains a separate expressive offset. Timelines and velocities are saved, so preview and playback use the same events.

Harmony uses the selected mode's diatonic qualities, rejecting schemas that would need diminished or augmented substitutions. A ii–V–I root pattern in Dorian/Aeolian does **not** imply a traditional jazz dominant-quality cadence. Borrowed dominants and full jazz reharmonization are future work. Genre/mood associations are compositional choices, not scientifically guaranteed emotional responses.

## Implementation and validation

- `sketch-library.ts`: named harmonic schemas, explicit drum grids and groove clock.
- `sketch-plan.ts`: seeded genre/mood selection, chord durations/rhythms, bass direction and surprise timing.
- `sketch-presets.ts`: genre defaults and arrangement forms.
- `sketch-generator.ts`: full production generator, independent of React and directly testable.
- `lead-harmony.ts`: shared lead-to-harmony fitting used by the generator and editors.
- `sketch-quality.ts`: ranks drafts and selects an alternative based on actual chord roots/timing and drum onsets, rather than labels or velocity jitter.

Integration tests exercise the same generator used by Easy Mode. They cover each genre/mood across 32 seeds, then full songs in 4/4, 6/8, 7/8 and 5/4, short/extended forms, fixed-seed reproducibility, instrumentation, backing-track exclusions and playback boundaries. Additional ranking sweeps ensure quality selection does not collapse the library's variety. Brittle UI source-text assertions for moved generator internals were replaced by behavioral coverage.

Automated checks establish structural coherence, deterministic diversity and playable data. They cannot establish emotional impact, taste or sample realism. Physical-device listening and browser interaction checks were not available in this environment. Existing saved projects retain their stored music; these changes affect newly generated sketches.

## Sources and interpretation

- [Open Music Theory: Four-Chord Schemas](https://viva.pressbooks.pub/openmusictheory/chapter/4-chord-schemas/) — singer-songwriter, doo-wop and hopscotch prototypes, rotations and substitutions.
- [Open Music Theory: Harmony in pop/rock music](https://openmusictheory.github.io/popRockHarmony.html) — plagal/modal cycles, lament and circle progressions.
- [Open Music Theory: ii–V–I](https://viva.pressbooks.pub/openmusictheory/chapter/ii-v-i/) — cadence qualities and turnaround vocabulary; informs the major soul patterns, not a claim of full jazz generation.
- [Ableton: Using Grooves](https://www.ableton.com/en/live-manual/12/using-grooves/) — independent timing/velocity and late snare placement.
- [Ableton: Mutation Over Generations](https://makingmusic.ableton.com/creating-variation-2-mutation-over-generations) — preserve recognizable material while changing selected dimensions.
- [Drumeo: Bernard Purdie's shuffle lesson](https://www.drumeo.com/beat/bernard-purdie-drum-lessons/) — triplet subdivision, half-time backbeat and two-bar phrasing. The app uses original generic groove templates, not a transcription of a song or Purdie's exact beat.

The concrete templates and their genre associations are our implementation choices based on this vocabulary. There is no universal objectively best progression or groove.
