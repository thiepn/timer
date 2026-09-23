# Timer v2.4 Release Scope

Timer v2.4 turns the existing multi-runtime kernel into a user-facing workspace and completes the completion-action orchestration layer.

Production scope includes:

- A dedicated Multi-Timer Workspace for all locally owned active timers.
- Grid, compact and focus workspace layouts.
- Persistent timer order across active-session checkpoints and process-loss restore.
- Runtime display names, groups and colors without mutating historical timer-plan truth.
- Per-timer pause/resume, focus, reorder, edit and explicit stop.
- Bulk Pause All, Resume All and Stop All operations.
- Direct launching of Saved Timers from the workspace.
- Completion actions: Stop, Overtime, Repeat and Start Next.
- Saved Timer completion defaults and Start Next targets.
- Chained Saved Timer launching with default/last parameter values for parameterized sequence timers.
- Foreground chains transfer focus to the next timer; background chains preserve another timer's focus.
- Manual stop/end always bypasses automation.
- Workspace order, completion configuration and chain targets persist in active recovery records.

Compatibility boundary:

- IndexedDB remains v6.
- Backup payload remains v4; backup versions v1-v4 remain importable.
- Saved Timer storage remains the existing `routines` store.
- Active workspace metadata remains recovery state and is not added to portable user backups.
- Native Android exact alarms, foreground services and widgets remain outside the PWA boundary.
