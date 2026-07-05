# Recording engine

Audience: users.

Session recording captures **this peer's** room traffic — a timed, local log of the wire signals it
sends and receives — so you can export it as a portable `.roomful` file or replay it later. It is
purely local: unlike comments or history it never touches the shared `Y.Doc` and is not synced, so
each peer records its own vantage point.

## Access

```ts
const recording = room.useRecording();
// with a privacy hook:
const recording = room.useRecording({ redact });
```

## Interface

```ts
interface RecordingEngine {
  start(): void; // begin capturing, discarding any previous take
  stop(): void; // stop; captured frames remain available
  getState(): RecordingState; // { isRecording, frameCount, durationMs }
  getFrames(): RecordingFrame[]; // a copy of the frames captured so far
  export(): RoomfulRecording; // serialize the take into a portable .roomful
  replay(recording?: RoomfulRecording): ReplaySession; // timed playback
  subscribe(callback: (state: RecordingState) => void): Unsubscribe;
}

interface RecordingOptions {
  // Privacy hook: runs on every frame before it is stored.
  redact?: (frame: RecordingFrame) => RecordingFrame | null;
  // Retention cap: keep only the most recent N frames (oldest dropped first).
  maxFrames?: number;
}
```

## Privacy — the `redact` hook

`redact` is applied to every candidate frame before it is stored, so sensitive data never enters the
recording in the first place. The frame's `signal` is a **fresh clone**, so you can mask it in place.
Return the frame to keep it, or `null` to drop it entirely.

```ts
const recording = room.useRecording({
  redact: (frame) => {
    // Drop a whole channel of sensitive traffic.
    if (frame.signal.type === 'event' && frame.signal.payload.name === 'chat:dm') {
      return null;
    }
    // Or mask a field in place, keeping the frame.
    if (frame.signal.type === 'presence') {
      frame.signal.payload = { ...frame.signal.payload, email: '[redacted]' };
    }
    return frame;
  },
});
```

Because redaction happens at capture time, the exported `.roomful` and any replay only ever contain
the redacted frames — there is no separate scrubbing step to forget.

## Retention — `maxFrames`

`maxFrames` caps how many frames a recording holds: once the cap is reached, the oldest frame is
dropped as each new one arrives, so a long-running capture keeps a bounded sliding window of the most
recent activity instead of growing without limit.

```ts
const recording = room.useRecording({ maxFrames: 5000 }); // keep the last 5k signals
```

Pair it with `redact` as a data-retention policy: `redact` controls _what_ is ever recorded,
`maxFrames` controls _how much_ is kept.

## Semantics

- **Local, not collaborative** — a recording is one peer's log; two peers each record their own view.
- **Capture is a tap, not a fork** — `ingest` is a no-op until `start()`, costing one boolean check
  when idle.
- **Replay is timed re-emission** — a `ReplaySession` streams frames back on a virtual clock that
  preserves the original inter-frame gaps; feed them into an offline room via `applyReplaySignal` to
  reconstruct the session visually.

## Related docs

- [Session summarizer](session-summarizer.md) — summarize a session from its events.
- [Adapters](README.md#adapters) — `useRecording` (React/Vue/Solid) and the Svelte `recording` store.
