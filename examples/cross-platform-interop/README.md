# Cross-platform interop example

A minimal React web client that joins a Roomful room over the **WebSocket relay** and shares
**presence** and **live cursors**. Open it alongside a Flutter (`roomful_flutter`) client — or a
second browser — pointed at the same relay and room, and they collaborate across platforms.

This is the web half of EP-14 #141; see [`docs/reference/interop.md`](../../docs/reference/interop.md)
for the protocol contract it relies on.

## Run

Works out of the box against the public Roomful relay (`wss://relay.roomful.dev`) — no setup:

```bash
pnpm --filter @roomful/example-cross-platform-interop dev
# http://127.0.0.1:4175/
```

Open it in two tabs (add `&name=Alice` / `&name=Bob`) to see presence and cursors sync, or open the
same room from a Flutter client to see it work across platforms.

To use your own relay instead, run one locally (`docker compose up` — relay on `ws://localhost:8787`)
and pass `?relay=ws://localhost:8787`.

## Configuration

All optional, via query string (or `VITE_ROOMFUL_RELAY_URL` for the relay):

- `?relay=` — the relay URL (`ws://` / `wss://`). Defaults to `wss://relay.roomful.dev`.
- `?room=` — the shared room id (default `roomful-interop-demo`).
- `?name=` / `?color=` — this peer's identity (otherwise random).

Presence and cursors are published in the shapes the relay validates (see the interop guide), so
they interoperate with the JavaScript and Dart/Flutter SDKs unchanged.
