# Timer v2.1 Release Scope

Timer v2.1 begins the post-v2 universal-timer architecture while preserving every v2.0 timer mode and data format.

Production scope includes:

- The complete v2.0 countdown, stopwatch, interval, custom-routine, cue, history, backup, accessibility and PWA feature set.
- A new `TimerCoordinator` above the existing deterministic `TimerEngine`, allowing multiple independent active timer runtimes under one device/runtime owner.
- Per-runtime active recovery checkpoints with migration from the legacy singleton `active/current` record.
- Minimal Active Timers UI: background the focused timer, see all active timers on Home, pause/resume an individual timer and focus it again.
- Explicit completion primitives for Stop, Overtime, Repeat and Start Next. Stop, Overtime and Repeat have coordinator semantics; Start Next is exposed as an orchestration intent for the later Sequence/Completion Actions phase.
- Shared-device services—Wake Lock, ownership heartbeat, service-worker update deferral and maintenance suspension—remain active until the final active timer ends.
- Per-runtime cue generations and serialized speech so simultaneous timers share one AudioContext without cancelling or overlapping one another incorrectly.

This release deliberately does **not** attempt the polished Multi-Timer Workspace, generic Saved Timer migration, Sequence Timer UI, chained completion-action editor or native Android background service. Those belong to later roadmap phases.
