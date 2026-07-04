# The `.roomful` session format

Audience: users.

A `.roomful` file is a portable, self-describing session recording — the JSON serialization of a
[`RoomfulRecording`](engines-recording.md). It is what `RecordingEngine.export()` produces and what
`parseRoomfulRecording()` reads back, so a session captured in one place can be replayed or analyzed
in another.

## Schema (version 1)

```jsonc
{
  "version": 1, // RECORDING_FORMAT_VERSION — bumped only on a breaking change
  "roomId": "room-123", // the room the signals were captured from
  "peerId": "peer-abc", // the local peer that captured them (one vantage point)
  "startedAt": 1717430400000, // absolute epoch ms when capture started
  "durationMs": 4200, // span of the recording (the last frame's offset)
  "frames": [
    {
      "t": 0, // ms elapsed from startedAt to this signal
      "direction": "inbound", // "inbound" (received) or "outbound" (sent)
      "signal": {
        /* a RoomTransportSignal — the wire message captured at the transport boundary */
      },
    },
  ],
}
```

- **One vantage point.** A recording is local: it holds the signals _this_ peer saw and sent. Two
  peers each produce their own `.roomful`.
- **`signal`** is a `RoomTransportSignal` — the same wire shape the transport exchanges (presence,
  cursor, event, `crdt:sync`, …). Binary `crdt:sync` payloads survive JSON via base64/array
  round-tripping done by the engine's clone step.
- **Versioning.** `version` is a single integer. An importer must refuse a version it does not
  understand rather than guess — `parseRoomfulRecording` returns `null` for any version other than
  the one it supports.

## Writing and reading

```ts
// Write: export the current take and save it.
const recording = room.useRecording().export();
const blob = new Blob([JSON.stringify(recording)], { type: 'application/json' });

// Read: validate a loaded file before trusting it.
import { parseRoomfulRecording } from '@roomful/core';

const parsed = parseRoomfulRecording(JSON.parse(fileText));
if (parsed) {
  room.useRecording().replay(parsed); // safe to replay
}
```

`parseRoomfulRecording(value)` validates the whole envelope — version, the top-level fields, and
every frame (each `signal` is run through the same transport-signal parser the live wire path uses).
It returns a fresh `RoomfulRecording`, or `null` when anything is malformed or an unsupported version,
so a bad or incompatible file can never reach `replay()`.

## Compression

`.roomful` is plain JSON, so it compresses well and gzip is the recommended transport/storage
strategy — a chatty session is mostly repeated field names and small deltas. In the browser, use the
native [`CompressionStream`](https://developer.mozilla.org/docs/Web/API/CompressionStream) (no
dependency):

```ts
// Save gzipped (.roomful.gz)
const json = new Blob([JSON.stringify(recording)]);
const gz = json.stream().pipeThrough(new CompressionStream('gzip'));

// Load: pipe through DecompressionStream('gzip'), then JSON.parse + parseRoomfulRecording.
```

The format itself is uncompressed JSON; compression is applied at the file/transport layer so a
`.roomful` remains trivially inspectable when you want it to be.

## Related docs

- [Recording engine](engines-recording.md) — capture, export, replay, and the `redact` privacy hook.
- [Session summarizer](session-summarizer.md) — summarize a session from its events.
