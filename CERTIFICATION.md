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
- Visual V2 tests certify the M0–M5 material hierarchy, T0–T5 typography roles, shape/motion scales, semantic state colors, theme propagation, accent state, reduced motion, forced colors and offline visual-system loading.
- Visual V3 tests certify the SVG shell icon system, responsive navigation rail/dock, contextual chrome, Workspace navigation mapping, modal hierarchy, live-mode shell isolation and reduced-motion View Transition fallback.
- V3 raises the measured offline-shell budget to 138 KiB gzip and the independent hard release ceiling to 140 KiB; the increase is reserved for the new shell/navigation/icon architecture.
- Visual V4 tests certify the signature Quick Timer instrument, dial semantics, SVG Home shortcuts, runtime progress/state visuals, responsive composition, OLED/high-contrast/forced-colors paths and the safe Workspace-card updater.
- V4 raises the measured offline-shell budget to 142 KiB gzip and the independent hard release ceiling to 145 KiB; the increase is reserved for the signature Home instrument and responsive runtime/preset presentation.
- Static release certification validates v2.5/v20 metadata.
- Existing twenty-runtime isolation, per-runtime persistence, cue arbitration, overtime recovery, historical backup compatibility and adversarial engine tests continue to pass.

## Environment-limited checks

Physical Android/TalkBack/Bluetooth/call/thermal behavior remains outside this automated environment. A pure PWA still cannot guarantee exact alarms after the browser process is fully suspended or killed; see `KNOWN_LIMITATIONS.md`.
