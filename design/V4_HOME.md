# Timer Visual V4 — Home 3.0 Signature Timer Surface

Phase V4 redesigns Home around one unmistakable primary object: the Quick Timer instrument.

## Implemented

### Signature Quick Timer instrument
- Circular clock-style duration dial.
- Accent sweep represents minute position within the current hour.
- Exact hours render a full minute dial while the numeric duration remains authoritative.
- Large stable tabular duration numerals remain the primary readable value.
- Dial visualization is decorative and hidden from assistive technology.
- Typed duration input remains the accessible source of truth.

### Quick Timer command surface
- Compact duration editor.
- Live duration preview and validation.
- Adjustment chips integrated into the instrument.
- Large tactile Start action with SVG play/forward affordance.
- Save and Customize demoted into quiet secondary controls.

### Presets and recents
- Pinned durations become compact timer tiles instead of generic chips.
- Recent durations become a quiet secondary list.
- Existing one-tap start behavior is unchanged.

### Active runtime summary
- Running timers sit in a compact Live Now band without displacing the Quick Timer hero.
- Real engine `current.progress` drives each runtime progress ring.
- Work/rest/prepare/recovery/paused/overtime states use semantic color.
- Pause/Resume and adjustments remain directly available.
- Mobile uses a horizontally scrollable active-runtime strip.

### Home shortcuts
- Old card grid replaced by a low-chrome action strip.
- Repeat Last, Stopwatch, Interval and All Timers use the shared SVG icon language.
- Secondary actions visually recede behind Quick Timer.

### Responsive and accessibility
- Wide layout separates the timer instrument from preset console.
- Phone layout stacks the instrument, controls and presets cleanly.
- 430 px and below receives denser pinned-duration layout.
- OLED removes ambient glow.
- High contrast strengthens container edges.
- Forced colors removes custom ambient/ring decoration while preserving the input and action hierarchy.

## Semantics

The idle dial is **not progress**.

Its sweep represents the minute position within the current hour:
- 30 minutes = 180 degrees
- 60 minutes = 360 degrees
- 1h 20m = 120 degrees + explicit 1h label

This prevents an unset/idle timer from visually pretending to be running.

## Functional preservation

V4 does not change:
- duration parsing
- Quick Timer start behavior
- recent/pinned persistence
- countdown construction
- active-runtime timing truth
- queue/workspace semantics
- history/recovery

## Next

V5 — Live Timer 3.0: Showcase Experience.

## Performance budget

The signature Home surface increases the measured shell from V3's 137.1 KiB to approximately **141.5 KiB gzip**. V4 therefore advances the explicit visual envelope to **142 KiB soft / 145 KiB hard**. The additional bytes are the Home instrument, responsive preset/runtime system, and associated state/accessibility styling; future phases must continue to account for shell growth explicitly.
