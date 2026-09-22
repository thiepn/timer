# Timer v2.0 Certification

## Automated release gate

The production release must pass `npm run certify`, which runs:

1. Full unit/integration/adversarial test suite.
2. JavaScript/service-worker syntax checks.
3. Performance and scale budgets.
4. Static release/security/PWA packaging checks.

## Certified automated scenarios

- Timestamp/deadline timer correctness under long scheduler stalls.
- Foreground manual wall-clock jumps do not alter active timer duration.
- Pause/resume uses monotonic elapsed time while the runtime remains alive.
- Running and paused session process-loss recovery.
- Seeded randomized command fuzz across countdown, interval, EMOM, stopwatch, AMRAP and For Time modes.
- Stale active-session checkpoint rejection and ordered final cleanup.
- Historical backup payload compatibility from v1 through v4.
- Backup SHA-256 integrity and password-encrypted backup round trip.
- PBKDF2 work-factor bounds and backup entity-count limits.
- Recovery snapshots, quarantine, sync journal/tombstones and selective export.
- Single-runtime lease exclusivity and expired-owner takeover.
- Formula sandbox restrictions and no arbitrary JavaScript execution primitives.
- Restrictive CSP baseline and preserved browser zoom.
- Offline service-worker shell completeness.
- Accessibility semantic-event announcements, interactive-control shortcut guards and forced-colors/zoom policy.
- 1,000-step compiler, 10,000-session analytics/history and long deadline reconciliation budgets.
- 24-hour countdown behavior and bounded custom-audio decode cache.

## Environment-limited checks

A local Chromium smoke launch was attempted during certification, but the container Chromium process cannot complete startup because its system DBus/UPower environment is unavailable. The attempt is recorded as **inconclusive**, not passed. Physical Android/TalkBack/Bluetooth/call/thermal checks remain outside this automated environment; see `KNOWN_LIMITATIONS.md`.
