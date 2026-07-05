---
'@roomful/core': minor
---

Add a recording retention cap. `room.useRecording({ maxFrames })` keeps only the most recent `maxFrames` frames, dropping the oldest first, so a long-running capture holds a bounded sliding window instead of growing without limit. Pairs with the `redact` hook as a data-retention policy: `redact` controls what is recorded, `maxFrames` controls how much is kept.
