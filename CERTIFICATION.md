# Timer v2.2 Certification

## Automated release gate

The production release must pass `npm run certify`, which runs:

1. Full unit/integration/adversarial test suite.
2. JavaScript/service-worker syntax checks.
3. Performance and scale budgets.
4. Static release/security/PWA packaging checks.

## Certified automated scenarios

All v2.1 certification scenarios remain required, plus:

- Quick duration parser accepts `90`, `90s`, `1:30`, `3m`, `1h 20m`, `h:mm:ss` and decimal unit notation.
- Malformed, zero, negative, ambiguous and excessive Quick Timer inputs are rejected before a timer starts.
- Recent durations are unique, newest-first and bounded.
- Pinned/adjustment duration normalization removes duplicates and invalid values.
- The service-worker shell contains both the coordinator and Quick Timer modules.
- Static release certification validates v2.2/v14 metadata.
- Existing twenty-runtime isolation, per-runtime persistence, cue arbitration, overtime recovery, historical backup compatibility and adversarial engine tests continue to pass.

## Environment-limited checks

Physical Android/TalkBack/Bluetooth/call/thermal behavior remains outside this automated environment. A pure PWA still cannot guarantee exact alarms after the browser process is fully suspended or killed; see `KNOWN_LIMITATIONS.md`.
