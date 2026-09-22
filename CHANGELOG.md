# Changelog

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
