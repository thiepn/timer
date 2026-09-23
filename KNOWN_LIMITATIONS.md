# Known Platform Limitations

Timer v2.2 is a local-first web/PWA application. These limitations are deliberate and are not represented as working native features:

- A pure PWA cannot guarantee an exact local alarm after Android has fully suspended or killed the browser process.
- A true Android home-screen App Widget is native-only and is not included.
- The active-session notification is best-effort and is not an Android foreground-service chronometer.
- Media Session/headset controls are optional because they may compete with music applications such as Spotify or YouTube Music.
- Browser/device support for Wake Lock, vibration, speech synthesis, notifications, Launch Handler and Media Session varies. Core timing does not depend on them.
- Automatic recovery snapshots live in browser/site storage and do not protect against device loss or clearing all site data. User-owned exported backups remain the disaster-recovery mechanism.
- If the process is destroyed and the device wall clock is manually changed before recovery, the web platform cannot reconstruct the lost monotonic clock. Foreground sessions are protected from wall-clock changes; process-loss recovery necessarily uses persisted wall time.

## Certification boundary

The automated v2.2 release gate certifies deterministic engine behavior, persistence, backup compatibility, security/static policy, accessibility contracts, performance budgets and PWA packaging. This environment does not provide a physical Android device, Bluetooth stack or phone-call lifecycle, so real-device Bluetooth/music/call/thermal behavior is not claimed as laboratory-certified by the automated suite.
