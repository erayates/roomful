---
'@roomful/core': minor
---

Add `room.applyReplaySignal(signal)` — feed a recorded wire signal back through the room's inbound pipeline to reconstruct presence, cursors, and shared state. This enables **visual session replay**: stream a recording's frames into a throwaway offline room (each signal carries its original `fromPeerId`, so every participant is rebuilt) and render the reconstructed state. The demo's Session recorder now replays visually — a sandbox room rebuilds the cursors at the original tempo — instead of streaming a raw signal log.
