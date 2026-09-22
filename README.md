# Timer

Current app version: **1.8.0**.

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
- Custom routines with nested sections/patterns, timed/manual steps, launch parameters, safe arithmetic formulas, progression generators, seeded random pools, reusable linked blocks, duration scaling/target fitting, deterministic compilation and plan preview
- Saved routine library + favorites + search + routine deletion
- Session history with semantic event timelines, calendar/stats views, actual-vs-planned review, objective comparable records, mode-specific analytics, notes, filtering and CSV/JSON export
- Focus, Classic, Strength and Wall live layouts
- Pause/resume, skip, previous, restart, time adjustment and fullscreen
- Advanced cue profiles, six sound packs, warning/halfway/custom cue points, configurable speech/haptics, per-routine/per-step overrides and uploaded local cue sounds
- Screen Wake Lock where supported
- Active-session persistence and reload recovery
- Versioned SHA-256-verified backup archives with selective export/restore, merge/replace preview, recovery snapshots, quarantine, optional password encryption, portable routine packages, and backward-compatible legacy restore
- Offline service worker + installable PWA manifest
- Single-runtime ownership across windows with Web Locks and a lease fallback
- Read-only secondary Wall display window with explicit takeover
- Deep-link launch commands, notification routing, safe deferred PWA updates, capability diagnostics and optional Media Session controls
- Launcher shortcuts for Quick Timer, Stopwatch, Favorites and Last Routine
- Keyboard controls during live sessions
- Light, Dark and OLED appearance modes
- Accessibility hardening: keyboard-safe controls, focus-contained dialogs, semantic timer announcements, browser zoom preserved, high contrast/forced-colors support, large controls/text, reduced motion, German localization, pseudo-localization and RTL test support

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
- `src/analytics.js` — pure session analysis, comparisons, records, calendars and history export
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

## v1.1.0 custom routines

- Added a full Custom Routine builder with nested `Section` and `Repeat` blocks.
- Added timed and manual custom steps with phase, optional target text, and optional manual time caps.
- Added accessible move-up/move-down controls so routine editing does not depend on dragging.
- Added a compiled-plan preview with executable step count, estimated duration, section context and repeat context.
- Compiled custom steps preserve source-node, section-path and repeat-path metadata for debugging/history.
- Custom routine compilation is deterministic for persisted node IDs and rejects duplicate IDs, empty containers, excessive nesting and invalid durations.
- Backup import now validates every saved routine through the real compiler before modifying local data.

## v1.2.0 parameterized routines and reusable blocks

- Custom Routines can expose duration and number parameters at launch without mutating the saved template.
- Parameterized repeat counts, timed durations, and manual-step caps compile deterministically into the existing runtime.
- Added reusable linked blocks with local parameter overrides, revision metadata, and circular-reference protection.
- Any custom subtree can be extracted into a reusable block; blocks can be inserted linked or as independent copies.
- Linked blocks can be edited from Library; every save increments the block revision for future sessions while existing session snapshots remain immutable.
- Added subtree copy/paste with parameter dependency preservation and explicit unlinking back to concrete steps.
- Backup format v2 carries reusable blocks while restore remains backward-compatible with v1 backups.
- Fixed the in-memory database fallback cloning path exposed by the expanded backup tests.


## v1.3.0 advanced generators and formulas

- Added a small safe arithmetic formula language implemented with an internal parser/AST; no `eval`, `Function`, DOM, network, or arbitrary code execution is used.
- Timed durations, manual caps, repeat counts, progression work/rest, and generator counts can resolve from formulas before the workout starts.
- Formula context includes `round`, `rounds`, `outerRound`, `outerRounds`, `index`, `base`, `previous`, plus explicit numeric/duration launch-parameter variables.
- Added formula helpers: `min`, `max`, `clamp`, `round`, `floor`, `ceil`, and `abs`.
- Added Progression Generator nodes for increasing/decreasing work/rest patterns and ladder-style routines.
- Added seeded Random Generator nodes with choose/shuffle modes, optional no-repeat selection, and immediate-repeat avoidance.
- Random sessions resolve to a concrete sequence before runtime and store the exact seed/compiled plan for reproducibility.
- Added explicit duration scaling and target-duration fitting for finite Custom Routines.
- Compiled steps now preserve generator source paths in addition to node/section/repeat/block source metadata.
- Reusable-block copy/unlink materializes formula/generator content safely into independent concrete steps.


## v1.4.0 advanced cue system

- Added Standard, Quiet, Voice Coach, Loud Gym and Silent cue profiles plus user-created custom profiles.
- Added Clean, Gym, Boxing, Minimal, Calm and Retro procedural sound packs with distinct work/rest/prepare/countdown/warning/halfway/finish cues.
- Added warning cues, halfway cues, one custom percentage cue point per custom step, and stale-cue suppression after skips/stalls.
- Added voice verbosity levels, voice selection, rate control, round/duration/next-step speech, and per-step custom phrases or voice suppression.
- Added routine-level cue profile/sound-pack overrides and Custom Routine per-step cue overrides.
- Added short uploaded custom audio cues stored locally, lazily decoded, selectable for step transitions/cue points, and included in full backups.
- Added per-cue sound mapping so work/rest/prepare/countdown/warning/halfway/finish may use different built-in or uploaded sounds.
- Cue scheduling now invalidates stale scheduled audio on pause/skip/restart and resumes the audio context after app interruptions where the browser allows it.
- IndexedDB/backup format v3 carries cue profiles and custom audio while v1/v2 backups remain importable.


## v1.5.0 history, analytics and session review

- Completed sessions now retain a bounded semantic event timeline covering starts, transitions, pauses, resumes, skips, restarts, time adjustments, manual completions, laps and completion. No per-tick samples are stored.
- Session Review shows actual vs planned time, wall/paused time, observed phase totals, skips/restarts/adjustments, notes, and chronological events.
- Added deterministic comparison fingerprints derived from resolved execution structure while ignoring title/theme/cue-only changes.
- Added comparable-attempt history and objective records for For Time, AMRAP and stopwatch laps.
- Added AMRAP normalized rep totals when movement targets are numeric, EMOM early-completion/rest summaries, and stopwatch average/median/range statistics.
- Added History List / Calendar / Stats views, search, mode filters, weekly/monthly factual summaries, and local JSON/CSV history export.
- Older session records remain readable; detailed event timelines simply appear when the source version recorded them.


## v1.6.0 backup, portability and data resilience

- Full backups now use a canonical `thiepn-timer-archive` wrapper with SHA-256 integrity verification before restore.
- Optional password encryption uses PBKDF2-SHA-256 key derivation and AES-256-GCM; forgotten passwords cannot be recovered.
- Restore opens a preview first and supports Merge or Replace for selected data categories.
- Every restore/recovery operation creates a pre-restore local snapshot and rolls back automatically if application fails part-way through.
- Automatic daily local recovery snapshots plus manual snapshots are retained with bounded pruning.
- Invalid imported records are retained in Quarantine rather than silently discarded or allowed to corrupt primary stores.
- Portable routine packages include dependent reusable blocks, custom cue assets, and custom cue profiles where required.
- IndexedDB schema v4 adds recovery, quarantine, change-journal, tombstone, and device-metadata stores.
- Mutable entities carry sync revision/device metadata and create deterministic change journal entries; deletions emit tombstones for future multi-device sync.
- Data & Backup settings expose storage usage, recovery count, quarantine count, device identity, journal size, and tombstone count.
- Raw v1-v4 legacy backups remain importable.

## v1.7.0 PWA and device integration hardening

- Added validated launch commands for Quick Timer, direct countdowns, saved routines, session detail, active-session return and Wall display mode.
- Added single active-runtime ownership using Web Locks where available with a short local lease fallback. Secondary windows become read-only observers instead of restoring duplicate cue/persistence engines.
- Added BroadcastChannel coordination, semantic active-session heartbeat snapshots, explicit ownership takeover and owner-focus requests.
- Added a same-device read-only Wall display window driven from the authoritative timer snapshot.
- Service-worker updates now wait safely during active sessions and can be explicitly applied afterward without surprise workout reloads.
- Notification clicks carry launch intent; optional active-session notifications are static/best-effort and never treated as exact background alarms.
- Added optional experimental Media Session/headset controls with cleanup at session end.
- Added Device & PWA capability diagnostics and explicit native-only reporting for true home-screen widgets and exact local alarms.


## v1.8.0 accessibility, internationalization and interaction hardening

- Added a dedicated accessibility layer with focus-contained dialogs, focus restoration, route-heading focus, semantic live announcements, and shortcut guards that ignore interactive/text-entry controls.
- Live timer updates no longer rely on per-second ARIA announcements; phase changes, pause/resume, manual completion and workout completion are announced semantically instead.
- Added large-control, high-contrast, text-size, reduced-motion, screen-reader-optimization, time-format and digit-format preferences. Browser pinch zoom remains enabled.
- Added forced-colors support and additional resilience for 200–400% zoom, long strings and mobile virtual keyboards.
- Added an internationalization layer with English, German, expanded pseudo-localization and RTL pseudo-localization; dates and human-readable durations are locale-aware while stored timer data remains locale-independent.
- Added runtime language switching for normal screens, localized built-in phase labels and notification text, plus explicit RTL direction handling.
- Wall-mode controls no longer auto-hide while keyboard focus is inside the live control surface.
- Added a keyboard-shortcut reference surface and ensured global workout shortcuts cannot double-fire when a button/input is focused.
