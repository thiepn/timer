# Timer v2.3 Release Scope

Timer v2.3 generalizes the former workout-oriented Routine library into universal Saved Timers while preserving the established storage and sync boundary.

Production scope includes:

- Saved countdown presets, stopwatch presets, intervals, sequence/advanced timers and all specialized timer builders.
- One-tap Quick Timer saving and a first-class reusable Countdown builder.
- Pin, favorite and archive states; icon, accent and description metadata.
- Collections with Cooking, Study, Workout, Church and Music defaults, plus user-created collections and tags.
- Search across timer metadata, collection, tags, type and timer summary.
- Recent, most-used, alphabetical and duration sorting.
- Duplicate and multi-select organization with bulk move, archive/restore and delete.
- In-place normalization of all legacy routine records with their IDs, timer configs, cue overrides, timestamps, usage data and history links retained.
- Existing v2.2 Quick Timer and v2.1 multi-runtime ownership/recovery behavior remains unchanged.

Compatibility boundary:

- IndexedDB remains v6 and continues to use the existing `routines` store as the durable Saved Timer store.
- Backup payload remains v4 and backup versions v1-v4 remain importable.
- No destructive rename or copy migration is performed.
