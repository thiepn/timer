# Timer v2.1 Certification

## Automated release gate

The production release must pass `npm run certify`, which runs:

1. Full unit/integration/adversarial test suite.
2. JavaScript/service-worker syntax checks.
3. Performance and scale budgets.
4. Static release/security/PWA packaging checks.

## Certified automated scenarios

All v2.0 certification scenarios remain required, plus:

- Twenty independent timer runtimes can coexist without sharing pause/deadline state.
- Pausing one timer leaves other timers advancing normally.
- Multiple active runtime snapshots restore together.
- Per-runtime recovery checkpoints are sequence-guarded and independently clearable.
- A stale completed repeat cycle cannot clear the newer cycle checkpoint for the same runtime.
- Overtime is explicit coordinator state, can be paused/finished, and survives persisted restore including offline elapsed wall time.
- Repeat completion starts a fresh engine cycle under the same stable runtime identity.
- Start Next is emitted as an explicit orchestration intent instead of silently starting arbitrary data.
- Cue generations and countdown de-duplication are isolated by runtime.
- The service-worker shell contains the coordinator module and the static release gate validates v2.1/v13 metadata.

## Environment-limited checks

A local Chromium smoke launch remains environment-limited by the container's DBus/UPower setup. Physical Android/TalkBack/Bluetooth/call/thermal checks remain outside this automated environment; see `KNOWN_LIMITATIONS.md`.
