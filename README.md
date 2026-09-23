# Timer

Current app version: **2.4.0**.

A local-first universal timer built as a zero-build PWA for GitHub Pages, ranging from simple countdowns and stopwatches to programmable interval and sequence timers.

## Included in the current build

- Quick Timer 2.0 with typed duration entry (`90s`, `1:30`, `3m`, `1h 20m`), one-tap pinned/recent durations, Repeat Last and customizable Home adjustment buttons
- Stopwatch with laps
- Work/rest intervals and Tabata
- Circuits with timed or manual steps
- EMOM / alternating EMOM behavior with early-completion rest
- AMRAP scoring
- For Time with optional cap
- Boxing rounds with correct optional final-rest behavior
- Run / Walk intervals
- Ladder and pyramid generators
- Sequence timers with nested sections/patterns, timed/manual steps, launch parameters, safe arithmetic formulas, progression generators, seeded random pools, reusable linked blocks, duration scaling/target fitting, deterministic compilation and plan preview
- Universal Saved Timers for countdowns, stopwatches, intervals, sequences and specialized templates, with pin/favorite/archive, icons, accents, descriptions, collections, tags, sorting, duplicate and bulk organization
- Multi-Timer Workspace with persistent ordering, groups/colors, grid/compact/focus layouts, bulk pause/resume/stop, and per-runtime editing
- Completion actions: Stop, Overtime, Repeat and Start Next, including recovery-safe Saved Timer chains
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
- Performance hardening: lazy 10k-history loading, paged history DOM, indexed recent-session reads, metadata-only custom-audio listings, battery-aware live scheduling, bounded custom-audio decode cache, deferred maintenance, cache-growth controls and automated performance budgets

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
npm run benchmark
```

## GitHub Pages

The app uses relative paths and is ready to be served from the repository root with GitHub Pages (`main` branch / root).

## Architecture

- `src/core.js` — deterministic timer plans and runtime engine
- `src/db.js` — IndexedDB persistence, settings and backups
- `src/audio.js` — audio, speech, haptic, wake-lock and notification adapters
- `src/analytics.js` — pure session analysis, comparisons, records, calendars and history export
- `src/performance.js` — performance budgets, live scheduling policy, instrumentation and deferred-maintenance coordinator
- `src/coordinator.js` — multi-runtime timer coordination, completion actions and overtime/repeat orchestration
- `src/quick.js` — deterministic Quick Timer duration parsing, normalization and recency helpers
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
- Timed durations, manual caps, repeat counts, progression work/rest, and generator counts can resolve from formulas before the timer starts.
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
- Service-worker updates now wait safely during active sessions and can be explicitly applied afterward without surprise timer reloads.
- Notification clicks carry launch intent; optional active-session notifications are static/best-effort and never treated as exact background alarms.
- Added optional experimental Media Session/headset controls with cleanup at session end.
- Added Device & PWA capability diagnostics and explicit native-only reporting for true home-screen widgets and exact local alarms.


## v1.8.0 accessibility, internationalization and interaction hardening

- Added a dedicated accessibility layer with focus-contained dialogs, focus restoration, route-heading focus, semantic live announcements, and shortcut guards that ignore interactive/text-entry controls.
- Live timer updates no longer rely on per-second ARIA announcements; phase changes, pause/resume, manual completion and timer completion is announced semantically instead.
- Added large-control, high-contrast, text-size, reduced-motion, screen-reader-optimization, time-format and digit-format preferences. Browser pinch zoom remains enabled.
- Added forced-colors support and additional resilience for 200–400% zoom, long strings and mobile virtual keyboards.
- Added an internationalization layer with English, German, expanded pseudo-localization and RTL pseudo-localization; dates and human-readable durations are locale-aware while stored timer data remains locale-independent.
- Added runtime language switching for normal screens, localized built-in phase labels and notification text, plus explicit RTL direction handling.
- Wall-mode controls no longer auto-hide while keyboard focus is inside the live control surface.
- Added a keyboard-shortcut reference surface and ensured global timer shortcuts cannot double-fire when a button/input is focused.


## v1.9.0 performance, battery and scale hardening

- Startup no longer waits for persistent-storage requests, storage-health diagnostics, recovery-snapshot work or tombstone cleanup; these tasks run later through a low-priority maintenance coordinator.
- Initial app boot loads only recent history; the full 10,000-session history is fetched on demand when History is opened.
- IndexedDB recent-session reads now use the existing `startedAt` index in descending order instead of loading and sorting the entire session store.
- History list DOM is paged in 100-row batches instead of rendering thousands of session rows at once.
- Added a metadata-only `customSoundMeta` store so Settings/Library views do not load audio ArrayBuffers merely to display sound names and sizes.
- Data-health counts use IndexedDB `count()` rather than materializing every record.
- Live timer scheduling is battery-aware: hidden/paused sessions perform no visual ticks, stopwatch uses 10 Hz, Wall/reduced-motion modes use 4 Hz, and smooth progress is capped near 30 Hz.
- Live semantic DOM (phase, round, next, mode panels) updates only when semantic state changes rather than on every animation frame.
- Secondary Wall display windows use low-frequency timestamp-derived updates instead of a continuous animation-frame loop.
- Heavy maintenance is suspended during active timers and resumed afterward.
- Custom audio decode caching is bounded with LRU eviction.
- Service-worker runtime caching is restricted to the declared app shell so arbitrary same-origin GETs cannot grow cache storage indefinitely.
- Added deterministic performance budgets, large-fixture regression tests, a benchmark command and a GitHub Actions quality workflow.
- Current reference benchmark on the development environment: ~11 ms for a 1,000-step generated compile, ~10 ms for a 10,000-session summary, and ~98 KiB gzip for the summed offline shell assets.


## v2.4.0 Multi-Timer Workspace & completion actions

- Added a dedicated Multi-Timer Workspace for every active runtime, with live cards, persistent ordering, groups, colors, and grid/compact/focus layouts.
- Added bulk Pause All, Resume All and Stop All plus per-timer reorder, rename, grouping, coloring and safe manual stop.
- Saved Timers can define default completion behavior: Stop, count Overtime, Repeat automatically, or Start Next.
- Start Next targets another Saved Timer and carries its target's own completion rule forward, enabling deterministic chains.
- Chain configuration and workspace metadata live in per-runtime recovery records, so reload/recovery preserves order, grouping and the next action.
- Manual End/Stop explicitly bypasses automation, preventing an intentional user stop from accidentally repeating or starting the next timer.
- Existing v2.3 Saved Timer records, v2.2 Quick Timer behavior, v2.1 multi-runtime recovery, IndexedDB v6 and backup payload v4 remain compatible.

## v2.2.0 Quick Timer 2.0 and new Home

- Rebuilt Home around Quick Timer and Active Timers instead of workout-specific shortcuts.
- Quick Timer accepts `90`, `90s`, `1:30`, `3m`, `1h 20m`, `h:mm:ss`, and decimal unit notation through a deterministic parser.
- Pinned and recent durations start immediately with one tap; recent values are unique, newest-first and bounded.
- Added configurable `+10s / +30s / +1m`-style buttons used by Quick Timer and adjustable active countdown cards.
- Active Timer cards expose independent pause/resume and direct positive adjustments without opening full-screen mode.
- Added a prominent Repeat Last shortcut plus fast Stopwatch, Interval and More Timers actions.
- Quick Timer preferences remain normal Settings data, so existing backup/export flows preserve them without a schema migration.


## v2.1.0 universal timer kernel

- Added a `TimerCoordinator` that owns multiple independent `TimerEngine` runtimes under one device/runtime owner.
- Multiple countdowns, stopwatches, intervals and advanced timers can remain active simultaneously without sharing pause/deadline state.
- Added per-runtime IndexedDB checkpoints in the `activeSessions` store with automatic migration from the legacy singleton `active/current` checkpoint.
- Added explicit completion primitives: Stop, Overtime, Repeat and Start Next. Overtime and repeat are implemented at the coordinator layer without duplicating the core timer engine.
- Added a minimal Active Timers home section and a `Run in background` action so one timer can be left running while another is started.
- Cue generation and countdown de-duplication are namespaced per runtime while all timers share one AudioContext; speech is queued so timers do not talk over each other.
- Wake Lock, runtime ownership and maintenance suspension now remain active until the last timer finishes.

## v2.0.0 production certification

- Feature scope is frozen in `RELEASE_SCOPE.md`.
- Added seeded cross-mode command fuzzing and process-loss recovery certification.
- Foreground and paused timing now stay monotonic across manual wall-clock changes.
- Active-session persistence is serialized and sequence-guarded against stale checkpoint overwrites.
- Added CSP/referrer hardening and static arbitrary-code-execution checks.
- Backup import now bounds PBKDF2 work factors and entity counts before expensive restore processing.
- Added one-command `npm run certify` gate covering tests, syntax, performance and release packaging.
- Platform-specific limitations and the real-device certification boundary are documented explicitly.
