# Changelog

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
