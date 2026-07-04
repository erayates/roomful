---
'@roomful/core': minor
---

Add privacy controls to session recording. `room.useRecording(options?)` now accepts a `redact` hook that runs on every captured frame before it is stored — return the frame (with its cloned `signal` masked in place) to keep it, or `null` to drop it entirely, so sensitive data never enters the recording. Exports the new `RecordingOptions` type.
