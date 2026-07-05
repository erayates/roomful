---
'@roomful/core': minor
---

Add `ReplaySession.seek(index)` for a scrubbable replay timeline. It pauses playback and re-emits every frame from the start up to `index`, so a listener that applies frames (e.g. `applyReplaySignal`) rebuilds the state at that point — enabling time-travel scrubbing of a recorded session. `index` is clamped to `[0, frameCount]`.
