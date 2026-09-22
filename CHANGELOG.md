# Changelog

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
