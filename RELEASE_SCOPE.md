# Timer v2.5 Release Scope

Timer v2.5 turns one-off Start Next chains into a first-class queue and automation system.

Production scope includes:

- Saved Queue presets containing ordered Saved Timer references.
- Visual queue building with drag-and-drop plus keyboard/touch-safe move controls.
- Arbitrary queue length up to the bounded queue-model limit.
- Queued-but-not-started timers shown before execution.
- Per-step behavior: Advance, Overtime, Repeat Step or Stop Queue.
- Whole-queue looping with explicit cycle count.
- Start, Pause, Resume, Skip and Stop Queue controls.
- Queue progress, current position, completed-step and skipped-step counters.
- Direct Saved Timer launching from queues while retaining independent runtime timing truth.
- Conversion of current Library views/collections and multi-selected Saved Timers into queues.
- Recovery-safe active queue state with current step, cycle, paused status and runtime linkage.
- Saved Queue persistence, backup/export and restore.
- Queue execution alongside unrelated independent timers in the Multi-Timer Workspace.

Compatibility boundary:

- IndexedDB upgrades from v6 to v7 by adding `queues` and `activeQueues`; existing stores are unchanged.
- Backup payload upgrades from v4 to v5 to carry Saved Queue presets.
- Backup versions v1-v4 remain importable. Replace restores from pre-v5 backups do not clear queue presets because those formats had no queue category.
- Active Queue runs are recovery state and are intentionally excluded from portable backups.
- Saved Timers continue to use the existing `routines` store.
- Native exact alarms, foreground services and Android widgets remain outside the PWA boundary.
