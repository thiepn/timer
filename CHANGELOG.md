# Changelog

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
