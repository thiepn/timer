# Timer

Current app version: **1.0.1**.

A local-first workout interval timer built as a zero-build PWA for GitHub Pages.

## Included in the current build

- Quick countdown timer with configurable presets
- Stopwatch with laps
- Work/rest intervals and Tabata
- Circuits with timed or manual steps
- EMOM / alternating EMOM behavior with early-completion rest
- AMRAP scoring
- For Time with optional cap
- Boxing rounds with correct optional final-rest behavior
- Run / Walk intervals
- Ladder and pyramid generators
- Saved routine library + favorites + search + routine deletion
- Session history with actual observed work/rest time, including pauses, skips and early endings
- Focus, Classic, Strength and Wall live layouts
- Pause/resume, skip, previous, restart, time adjustment and fullscreen
- Sound countdown/transition cues, optional speech and haptics
- Screen Wake Lock where supported
- Active-session persistence and reload recovery
- Full JSON backup/import
- Offline service worker + installable PWA manifest
- Launcher shortcuts for Quick Timer, Stopwatch, Favorites and Last Routine
- Keyboard controls during live sessions
- Light, Dark and OLED appearance modes
- Accessibility baseline: semantic controls, visible focus, zoom preserved, reduced-motion support

## Run locally

No build step is required. Serve the repository with any static web server, for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Tests

Requires a modern Node.js version:

```bash
npm test
npm run check
```

## GitHub Pages

The app uses relative paths and is ready to be served from the repository root with GitHub Pages (`main` branch / root).

## Architecture

- `src/core.js` — deterministic timer plans and runtime engine
- `src/db.js` — IndexedDB persistence, settings and backups
- `src/audio.js` — audio, speech, haptic, wake-lock and notification adapters
- `src/app.js` — application coordinator and UI
- `sw.js` — offline application shell

The timer engine is timestamp-based; rendering frequency is not the source of timing truth.

## v1.0.1 hardening

- Fixed Boxing always adding a final rest even when disabled.
- Fixed ending a timer while paused incorrectly counting paused wall time as active time.
- History now uses observed phase time instead of blindly summing the planned routine.
- Time-adjust controls disable when the current mode has no adjustable deadline.
- Added Library search and safe saved-routine deletion.
- Exposed the existing one-tap quick-preset option in Settings.
- Hardened wake-lock reacquisition around sessions that complete while returning to the app.
