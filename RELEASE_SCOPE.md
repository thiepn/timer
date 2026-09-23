# Timer v2.2 Release Scope

Timer v2.2 is the Quick Timer 2.0 and Home redesign release built on the v2.1 multi-timer kernel.

Production scope includes:

- Deterministic Quick Timer parsing for bare seconds, unit notation, `m:ss`, and `h:mm:ss`, bounded from 1 second through the Quick Timer maximum.
- One-tap pinned durations and a bounded recent-duration list stored in normal Settings data.
- A utility-first Home with prominent Active Timers, direct pause/resume, direct positive adjustments on adjustable countdowns, Repeat Last, Stopwatch, Interval and More Timers shortcuts.
- User customization of pinned Quick Timer durations and three Home adjustment buttons using the same parser as the main Quick Timer field.
- Starting any pinned/recent/custom Quick Timer adds a new coordinator runtime without disturbing existing timers.
- Existing v2.1 ownership, recovery, cue, Wake Lock, notification and multi-runtime guarantees remain unchanged.

This release deliberately does **not** implement Saved Timer metadata/collections, the full Sequence Timer UX, the dedicated Multi-Timer Workspace, QR sharing or native Android exact alarms/widgets. Those remain later roadmap phases.
