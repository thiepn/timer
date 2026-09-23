# Changelog

## 2.4.0

### Added
- Dedicated Multi-Timer Workspace with live grid, compact and focus layouts.
- Persistent active-timer ordering, workspace groups, colors and runtime display names.
- Bulk Pause All, Resume All and Stop All controls plus per-timer reorder and workspace editing.
- Completion-action editor supporting Stop, Overtime, Repeat and Start Next.
- Saved Timer completion defaults and Saved Timer-to-Saved Timer chains.
- Direct Saved Timer launching from the workspace.

### Reliability
- Workspace order and metadata are stored in active-session recovery checkpoints and restored deterministically.
- Start Next launches the configured Saved Timer before retiring the completed runtime, preserving ownership and Wake Lock continuity across chains.
- Background chains do not steal focus from another live timer.
- Manual stop/end bypasses Repeat and Start Next so explicit user termination cannot trigger automation.
- Existing IndexedDB v6 and backup payload v4 formats remain unchanged.
- Service-worker cache generation bumped to v16.

## 2.3.0

### Added
- Universal Saved Timers spanning countdown presets, stopwatches, intervals, advanced sequences and specialized timer templates.
- First-class reusable countdown saving directly from Quick Timer and the normal Countdown builder.
- Saved Timer metadata: pin, favorite, archive, icon, accent, description, collection and tags.
- Default Cooking, Study, Workout, Church and Music collections plus custom collection management.
- Recent, most-used, alphabetical and duration sorting, with full metadata-aware search.
- Duplicate, multi-select and bulk move/archive/restore/delete operations.

### Migration and compatibility
- Existing saved routines remain in the established IndexedDB `routines` store and are upgraded in place to Saved Timer schema v2 without dropping timer config, cue overrides, history references or usage data.
- Backup payload remains v4 and historical backup v1-v4 restore remains supported.
- IndexedDB remains v6; no destructive database-store migration is required.
- Service-worker cache generation bumped to v15.


## 2.2.0

### Added
- Quick Timer 2.0 with deterministic parsing for bare seconds, `90s`, `1:30`, `h:mm:ss`, unit strings such as `3m`, and mixed input such as `1h 20m`.
- One-tap pinned Quick Timer durations and a bounded most-recent duration list.
- Prominent Home Active Timers cards with independent pause/resume plus configurable positive adjustment buttons for adjustable countdowns.
- Repeat Last shortcut using the most recent repeatable completed session.
- Quick Timer customization sheet for pinned durations and three Home adjustment buttons.
- Dedicated `src/quick.js` module with parser/normalization tests.

### Improved
- Home is now utility-first rather than workout-first: Quick Timer and Active Timers dominate the screen, while Stopwatch, Interval and additional timer builders are secondary shortcuts.
- Starting another Quick Timer no longer requires touching or stopping existing active timers; it enters the v2.1 coordinator as another independent runtime.
- Quick Timer recent-duration writes are serialized so rapid consecutive starts preserve deterministic recency order.
- Performance benchmark now measures the complete current application shell, including coordinator and Quick Timer modules.

### Compatibility
- IndexedDB remains v6 and backup payload remains v4; new Quick Timer preferences live inside the existing Settings record.
- Legacy `startPresetImmediately` data remains readable for backup compatibility, but v2.2 pinned Home durations are intentionally one-tap starts.
- Service-worker cache generation bumped to v14.

## 2.1.0

### Added
- Universal `TimerCoordinator` with independent concurrent timer runtimes.
- Per-runtime active-session persistence and automatic migration from the v2.0 singleton checkpoint.
- Completion primitives for stop, overtime, repeat and start-next workflows.
- Minimal Active Timers dashboard cards plus `Run in background` from the live timer.
- Per-runtime cue generations and serialized speech arbitration for simultaneous timers.

### Improved
- Wake Lock, maintenance suspension, runtime ownership and service-worker update deferral now operate on the complete active-timer set rather than one focused timer.
- Cross-window heartbeat/takeover payloads carry all active timers while preserving one runtime authority.
- Active notifications use per-runtime tags.

### Compatibility
- IndexedDB schema upgraded from v5 to v6. Existing `active/current` recovery state migrates automatically into `activeSessions`.
- Backup payload remains v4; active runtimes are recovery state and are not added to portable backups.
- Service-worker cache generation bumped to v13.

## 2.0.0

### Fixed
- Foreground sessions no longer rebase to wall-clock time when returning from the background, preventing manual system-clock changes from becoming workout time.
- Pause/resume and manual finish preserve active duration using the monotonic clock while the runtime remains alive.
- Active-session checkpoints are serialized and sequence-guarded so stale asynchronous writes cannot replace newer recovery state or reappear after final cleanup.

### Security and resilience
- Added a restrictive production Content Security Policy and no-referrer policy.
- Added static release checks forbidding `eval`, `new Function`, `document.write`, and non-local JavaScript imports.
- Encrypted-backup PBKDF2 work factors are bounded before key derivation.
- Backup entity counts are bounded before restore validation loops.

### Certification
- Added seeded command fuzzing across six timer plan families.
- Added running/paused process-loss recovery equivalence tests and historical backup v1-v4 compatibility tests.
- Added ownership-lease expiry certification and offline-shell import completeness checks.
- Added `npm run certify` and consolidated CI onto the production release gate.
- Added release scope, certification matrix and documented platform limitations.

### Release
- App version: 2.0.0.
- IndexedDB schema remains v5.
- Backup payload remains v4.
- Service-worker cache generation is v12.

## 1.9.0

### Added
- Dedicated performance module with release budgets, boot instrumentation, battery-aware live scheduling policy and deferred-maintenance coordination.
- Performance regression suite covering 1,000-step compilation, 10,000-session analytics, large recent-session queries, long deadline reconciliation, 24-hour countdown accuracy and custom-audio metadata behavior.
- `npm run benchmark` with compiler, analytics and offline-shell gzip size gates.
- GitHub Actions quality workflow running tests, syntax validation and benchmark gates on pushes and pull requests.
- Metadata-only IndexedDB store for custom cue sounds.

### Improved
- Initial boot loads a bounded recent-history window and defers full 10,000-session history until History is actually opened.
- IndexedDB recent-session reads use the `startedAt` index instead of `getAll()` plus in-memory sorting.
- History list renders in 100-row batches with explicit Load More controls.
- Storage-health diagnostics use store counts instead of loading all primary data into memory.
- Persistent-storage requests, recovery snapshot creation, data-health refresh and tombstone cleanup no longer block the interactive boot path.
- Heavy maintenance pauses during active workouts.
- Live timer stops visual scheduling while hidden/paused, uses 10 Hz for stopwatch, 4 Hz for Wall/reduced-motion states, and approximately 30 Hz for smooth progress.
- Phase/round/next/mode-panel DOM only updates on semantic state changes.
- Secondary Wall display uses bounded timer updates instead of continuous animation frames.
- Custom audio buffer cache uses bounded LRU eviction.
- Service worker caches only declared shell assets at runtime, preventing unbounded same-origin cache growth.

### Compatibility
- IndexedDB schema upgraded to v5 by adding `customSoundMeta`; existing custom sounds are indexed into the metadata store during upgrade without altering audio data.
- Backup payload remains v4 and no backup migration is required.
- Service-worker cache generation bumped to `thiepn-timer-v11`.

## 1.8.0

### Added
- Dedicated accessibility and internationalization modules.
- Focus-contained dialogs with Escape handling and focus restoration.
- Semantic live timer announcements for step transitions, pause/resume, manual completion and workout completion.
- Accessibility preferences for large controls, high contrast, text size, reduced motion and screen-reader optimization.
- Locale preferences for language, 12/24-hour display and numbering-system behavior.
- English/German UI localization plus expanded and RTL pseudo-locales for layout certification.
- Locale-aware dates and human-readable duration formatting.
- Forced-colors/high-contrast CSS and explicit RTL layout hooks.
- Keyboard-shortcut reference UI and regression tests.

### Improved
- Browser pinch zoom remains available; no viewport zoom restrictions were introduced.
- Global workout shortcuts ignore focused interactive/text-entry controls, preventing keyboard double actions.
- Wall-layout controls stay visible while keyboard focus is inside the live workout surface.
- History view switching uses ordinary pressed-button semantics rather than an incomplete ARIA tabs pattern.
- Active timer progress exposes progressbar semantics without announcing every render tick.
- Screen-reader optimization suppresses app speech synthesis even when routine cue overrides request voice.
- Service-worker shell now caches accessibility and localization modules for offline use.

### Compatibility
- IndexedDB remains v4 and backup payload remains v4; no data migration is required.
- Existing users receive new accessibility/i18n preferences through default settings merging.

## 1.7.0

### Added
- Validated launch-command routing for Quick Timer, stopwatch, saved routines, completed sessions, direct-duration timers, active-session return and read-only Wall display mode.
- Single-runtime ownership using Web Locks with a bounded local lease fallback.
- BroadcastChannel coordination with semantic session snapshots, explicit takeover and owner-focus requests.
- Read-only same-device Wall display window driven by the authoritative active-session snapshot.
- Safe service-worker update banner/deferral so waiting updates never reload an active workout.
- Notification click routing plus optional static active-session notifications.
- Experimental Media Session/headset controls behind an explicit setting.
- Device & PWA capability diagnostics with native-only boundaries for Android widgets and exact local alarms.

### Improved
- Only the runtime owner may hold Wake Lock, emit cues, publish active persistence checkpoints or own Media Session controls.
- Completion notifications now link back to the completed session detail.
- Active notifications are closed when the app returns to the foreground or the session ends.
- Installed PWA manifest declares focus-existing launch behavior where supported.

### Compatibility
- IndexedDB remains v4 and backup payload remains v4; no data migration is required.
- Service-worker cache generation bumped to `thiepn-timer-v9`.

## 1.6.0

### Added
- Canonical versioned Timer backup archives with SHA-256 integrity verification.
- Optional password-encrypted backups using PBKDF2-SHA-256 and AES-256-GCM.
- Restore preview with selective categories plus Merge or Replace strategy.
- Automatic pre-restore rollback snapshots and immediate Undo Restore support.
- Daily and manual local recovery snapshots with bounded retention.
- Quarantine storage for invalid imported records.
- Dependency-aware portable routine packages containing linked blocks and required cue assets.
- Data health panel with local storage, recovery, quarantine, device, journal, and tombstone diagnostics.
- Sync-ready device identity, per-entity sync revisions, change journal, and deletion tombstones.

### Improved
- Backup payload format moved to v4 while raw v1-v3 backups remain accepted.
- Selective backup/restore can independently include routines, blocks, cue profiles, custom sounds, history, and settings.
- Restore failures automatically roll the local database back to the pre-restore snapshot.
- Service-worker cache includes the resilience module for offline restore/export support.

### Compatibility
- IndexedDB schema upgraded to v4. Existing v3 data is migrated in-place by adding resilience stores; user timer data is unchanged.
- Service-worker cache generation bumped for v1.6.0 assets.

## 1.5.0

### Added
- Bounded semantic event history for completed sessions without per-tick logging.
- Pure session analyzer with planned-vs-actual timing, wall/paused time, phase totals, skips, restarts and adjustment summaries.
- List, Calendar and Stats History views with search and mode filtering.
- Deterministic comparison fingerprints based on resolved execution structure rather than titles or cue settings.
- Comparable-attempt history and objective records for For Time, AMRAP and stopwatch laps.
- AMRAP normalized rep scoring when numeric movement targets are available.
- EMOM early-completion/rest summaries and stopwatch lap average/median/range statistics.
- Session notes and chronological event timelines.
- Filter-aware CSV and JSON history export.

### Improved
- History now loads up to 10,000 local sessions for long-term summaries while remaining fully local/offline.
- Automatic delayed completions retain their scheduled boundary in the event timeline.
- Derived records and comparisons recompute from raw session records after edits/deletions instead of persisting stale analytics flags.
- Older history remains compatible and degrades gracefully when event details were not recorded.

### Compatibility
- IndexedDB remains v3 and backup format remains v3; no migration is required.
- Service-worker cache generation bumped for v1.5.0 assets.

## 1.4.0

### Added
- Five built-in cue profiles plus user-created custom cue profiles.
- Six procedural sound packs with distinct phase/countdown/warning/halfway/finish recipes.
- Configurable warning, halfway, and per-step percentage cue points.
- Voice selection, speech rate, verbosity, round/duration/next-step announcements, and custom per-step phrases.
- Routine-level cue profile/sound-pack overrides and per-step sound/voice/cue overrides for Custom Routines.
- Uploaded local cue sounds with lazy decoding, size/duration validation, playback preview, and backup portability.
- Advanced per-cue sound mapping for work/rest/prepare/countdown/warning/halfway/finish.

### Improved
- Cue generation invalidates stale scheduled audio on pause, skip, restart and step transitions.
- Countdown/warning/halfway/custom cue arbitration prevents catch-up cue storms after stalls.
- Missing/deleted custom audio gracefully falls back to the selected sound pack.
- Audio context is resumed on foreground return when allowed by the browser.
- Custom-sound deletion cleans active settings, profiles, routines and reusable-block references.

### Compatibility
- IndexedDB schema upgraded to v3 with `cueProfiles` and `customSounds` stores.
- Backup format upgraded to v3; v1 and v2 backups remain importable.
- Service-worker cache generation bumped for v1.4.0 assets.

## 1.3.0

### Added
- Safe arithmetic formula parser/evaluator for advanced Custom Routine programming; formulas never execute JavaScript.
- Formula-driven timed durations, manual caps, repeat counts, and launch-parameter variables.
- Progression Generator nodes for increasing/decreasing work and rest patterns.
- Seeded Random Generator nodes with choose/shuffle modes, no-repeat selection, and immediate-repeat avoidance.
- Deterministic generator source metadata and stored random seeds in compiled plans.
- Explicit Custom Routine duration scaling and proportional target-duration fitting.
- Formula-variable names for duration/number launch parameters.

### Improved
- Repeat blocks now double as reusable pattern generators with formula-aware children.
- Compiled preview shows generator context, random seed, scale, and target-duration metadata.
- Live timer context identifies random-generator position while keeping the existing runtime unchanged.
- Copying or unlinking reusable blocks with formulas/generators safely materializes their resolved steps.
- Parameter dependency tracking now includes formula references.
- Added regression coverage for formula safety, progressions, seeded randomization, scaling/target fitting, dependency tracking, and backup persistence.

### Compatibility
- IndexedDB and backup schemas remain compatible with v1.2.0; no data migration is required.
- Service-worker cache generation bumped so installed PWAs receive v1.3.0 assets.

## 1.2.0

### Added
- Launch parameters for Custom Routines, including duration and whole-number parameters.
- Parameter bindings for timed-step duration, manual-step time caps, and repeat counts.
- Reusable linked blocks with per-instance parameter overrides and source/revision metadata.
- Reusable-block editing from Library with revision increments on save.
- Linked-vs-copied block insertion, subtree copy/paste, block extraction, and explicit unlinking.
- Circular reusable-block detection and missing-block validation.
- Backup format v2 with reusable-block portability and backward-compatible v1 restore.

### Improved
- Custom compiled previews now show reusable-block source context and default launch parameters.
- Saved parameterized routines remember their most recently used launch values.
- Library search includes reusable blocks and their parameter names.
- Expanded deterministic tests for parameter resolution, block expansion, circular references, backup compatibility, and block revisions.

### Fixed
- Corrected the in-memory database fallback clone path used when IndexedDB is unavailable.

## 1.1.0

### Added
- Custom Routine builder with nested sections and repeat blocks.
- Timed and manual custom steps with phases, targets, and optional manual caps.
- Accessible move-up/move-down editing controls for nested routine items.
- Compiled-plan preview with duration, manual-step count, section context, and repeat context.
- Deterministic source mapping for generated custom routine steps.

### Improved
- Backup imports validate all routines through the production compiler before writing data.
- Live workout context now includes the active custom section together with repeat-round context.
- Removed a duplicate install-prompt event listener.

## 1.0.1

### Fixed
- Boxing no longer adds a final rest unless explicitly enabled.
- Ending a session while paused no longer counts the paused period as active time.
- History work/rest totals now reflect actual observed phase time rather than the full planned routine.
- Wake Lock is not reacquired after a session completes during foreground reconciliation.
- Time-adjust controls are disabled for paused or non-deadline states.

### Improved
- Added routine search in Library.
- Added safe deletion for saved routines while preserving session history.
- Added the quick-preset immediate-start preference to Settings.
- Expanded deterministic regression coverage for phase accounting, paused completion, EMOM, and Boxing final-rest behavior.
