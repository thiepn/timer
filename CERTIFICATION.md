# Timer v2.5 Certification

## Automated release gate

The production release must pass `npm run certify`, which runs:

1. Full unit/integration/adversarial test suite.
2. JavaScript/service-worker syntax checks.
3. Performance and scale budgets.
4. Static release/security/PWA packaging checks.

## Certified automated scenarios

All v2.4 certification scenarios remain required, plus:

- Quick duration parser accepts `90`, `90s`, `1:30`, `3m`, `1h 20m`, `h:mm:ss` and decimal unit notation.
- Malformed, zero, negative, ambiguous and excessive Quick Timer inputs are rejected before a timer starts.
- Recent durations are unique, newest-first and bounded.
- Pinned/adjustment duration normalization removes duplicates and invalid values.
- The service-worker shell contains both the coordinator and Quick Timer modules.
- Saved Timer model tests cover legacy normalization, collection/tag normalization, filtering, all four sort modes and duplication semantics.
- The service-worker shell contains the Saved Timer module.
- Coordinator tests cover persistent workspace order, runtime metadata updates and restore.
- Bulk pause/resume is certified without changing timer truth while paused.
- Explicit stop is certified to bypass Repeat and Start Next completion automation.
- Static certification checks the Multi-Timer Workspace and completion-chain wiring.
- Queue-model tests cover normalization, deterministic ordering, skipping, looping, progress and completion.
- Database tests cover Saved Queue round-trip, active queue recovery state and backup v5.
- Compatibility tests verify pre-v5 replace restores cannot erase queue presets.
- Static certification verifies the queue module is in the offline shell and queue UI/control wiring exists.
- The v2.5 performance budget allows at most 132 KiB gzip for the full offline shell; the independent hard release ceiling remains 135 KiB.
- Static release certification validates v2.5/v17 metadata.
- Existing twenty-runtime isolation, per-runtime persistence, cue arbitration, overtime recovery, historical backup compatibility and adversarial engine tests continue to pass.

## Environment-limited checks

Physical Android/TalkBack/Bluetooth/call/thermal behavior remains outside this automated environment. A pure PWA still cannot guarantee exact alarms after the browser process is fully suspended or killed; see `KNOWN_LIMITATIONS.md`.
