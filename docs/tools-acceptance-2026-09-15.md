# Instrument workspace acceptance — 15 September 2026

## Changes

- Global Create new starts a fresh standalone draft, with independent tempo/key/meter and a new draft identity. It clears editing and destination state. Project previews and saves cannot be updated until a destination is explicitly chosen. Standalone instruments have Play/Stop, Loop and Click controls; project tools retain the shared section transport.
- Generation stays visible outside settings. Shape & sound contains named, mutually exclusive settings groups. Existing controls remain available. Chord rhythm starts collapsed. Variations are visually secondary. Explore ideas/Edit notes use native pressed buttons instead of incomplete tab semantics.
- Compact mode under Settings reduces spacing, headings and menu/transport text independently of theme. Its device-local value survives reload. Touch controls retain 44px minimum heights and mobile editable fields retain 16px text. Browser text scaling is not disabled.
- Tool headers precede account status; drum grid supports arrows/Home/End and avoids dozens of preview-only tab stops. Melody notes have explicit labels and keyboard activation opens the note editor. Added visible focus and reduced-motion styles.

## Browser checks

Isolated Chrome preview, disposable seeded projects:
- Open Midnight Thoughts, then Create new → Drum loop: Standalone idea at 120 BPM, C Ionian, 4/4, no project transport. Play enters Stop state and stops successfully.
- Shape & sound opens; Enter opens Groove. Enter on Energy closes Groove. The generation action stays visible when settings are closed.
- Compact mode checkbox persists after reload.
- At 320px iframe width, chord tool document width and scroll width both 305px. At 1280px iframe width, drum tool widths both 1265px. Scrollbar accounts for the 15px difference. Screenshots inspected at phone and desktop widths.
- Keyboard ArrowRight moves from Kick step 1 to step 2. Editing an actual project section retains Play current section and does not display standalone playback.
- At 390px iframe width, the section transport measures 113px high in Compact mode versus 135px in Comfortable mode.

## Acceptance limits

This is targeted UX and keyboard acceptance, not a complete WCAG certification. Physical touch/Safari, screen readers, 200% text enlargement, every modal focus trap, every tool at every breakpoint, perceptual audio quality and authenticated account sync remain unverified. The development-account sync warning is expected and was not bypassed. Home, projects and arrangement structure are preserved apart from the optional density setting.
