# Roomful Protocol Fixtures

Canonical, language-neutral test vectors for the Roomful wire protocol
([RFC-0001](../rfcs/0001-protocol-v2.md), issue #102). Every SDK — the JS `@roomful/core`, the future
`roomful` Dart client, and any other — proves conformance by passing the **same** vectors. This is the
mechanism that makes "one protocol across SDKs" real (release gate G2).

## Files

- `core-vectors.json` — the reference vectors, **generated from `@roomful/core`** and drift-guarded by
  `packages/core/src/protocol/protocol-fixtures.test.ts`. Do not edit by hand; update the generator and
  re-run the test (`pnpm --filter @roomful/core test -- protocol-fixtures`) to regenerate.

## Format

```jsonc
{
  "version": 1,
  "sessions": { "legacy": {...}, "v2json": {...}, "v2msgpack": {...} },
  "negotiation": [
    { "name", "local": <capabilities>, "remote": <capabilities|null>, "supportsBinary", "result": <negotiation result> }
  ],
  "envelopes": [
    { "name", "session": <session>, "message": <PeerWireMessage>, "wireBase64": <base64 of wire bytes>, "text"?: <JSON string for json codec> }
  ]
}
```

- **Binary fields** in a `message` are encoded as `{ "$bin": "<base64>" }` so the fixture stays plain
  JSON. Revive them to your language's byte array before comparing.
- **`wireBase64`** is base64 of the exact on-the-wire bytes: UTF-8 of the JSON string for the `json`
  codec (also given verbatim in `text`), or the MessagePack bytes for the `msgpack` codec.

## How an SDK proves conformance

For each **envelope** vector:

1. **Decode** — base64-decode `wireBase64`, parse it with your SDK, and assert the result deep-equals
   `message` (with `$bin` revived). This is the primary, order-independent gate.
2. **Encode (best-effort)** — serialize `message` under `session` and compare to `wireBase64`.
   Byte-exact encoding depends on map-key order; if your encoder orders keys differently, rely on the
   decode round-trip and on `parse(encode(message)) == message` instead.

For each **negotiation** vector: run your negotiator with `local`, `remote`, and `supportsBinary`, and
assert the negotiated session equals `result.session` (the `reason` string is informational).

## Notes

- `timestamp` is pinned (`1700000000000`) so vectors are deterministic; the legacy v1 envelope has no
  `timestamp` field, so a decoder fills it from its clock — pin the clock to reproduce these vectors.
- The current capabilities are fixed at `minVersion: 1` / `maxVersion: 2`, so all valid capabilities
  overlap and negotiation is always compatible; an "incompatible" vector will be added when a version
  range that cannot overlap becomes representable.
