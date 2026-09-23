# Timer Visual V2 — Design System V3

Phase V2 converts the V1 contract into production primitives without redesigning individual screen composition.

## Implemented

- M0–M5 semantic materials via `--material-*` tokens and reusable classes.
- T0–T5 typography roles with stable tabular timer numerals.
- R1–R5 semantic shape scale.
- Micro / control / spatial / state motion tokens.
- Independent user-accent palettes.
- Independent temporal-state colors for work, rest, prepare, recovery, paused, overtime, warning, danger and complete.
- Designed Dark, Light and OLED foundations.
- Legacy token bridge so existing screens immediately inherit V3.
- Global primitive adoption for cards, raised interactive objects, floating controls, modal sheets and live-stage surfaces.
- High-contrast, forced-colors and reduced-motion fallbacks.
- Persistent Accent control in Settings.
- Document-level theme propagation so sheets/toasts outside the app shell receive the active theme.
- Offline service-worker inclusion and release/performance accounting.

## Scope boundary

V2 deliberately does not redesign Home, Live Timer, Library, Workspace, Queue or History layouts. It establishes the system those phases consume.

## Performance boundary

`visual-system.css` is counted as part of the offline shell. The soft shell benchmark is 134 KiB gzip for V2; the independent hard release ceiling remains 135 KiB.

## Next

V3 — App Shell, Navigation & Spatial Architecture.
