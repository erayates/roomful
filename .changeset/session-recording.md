---
'@roomful/core': minor
'@roomful/react': minor
---

Add session recording. `room.useRecording()` (core) captures a room's wire signals at the transport boundary — local to the peer, riding no relay change — then replays them at their original tempo or exports them as a portable `.roomful` recording. The React adapter exposes the same surface through the `useRecording()` hook: reactive `isRecording`/`frameCount`/`durationMs` plus stable `start`/`stop`/`replay`/`exportRecording` controls.
