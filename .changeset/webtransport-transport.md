---
'@roomful/core': minor
---

Add a WebTransport transport, selectable with `transport: 'webtransport'`. It carries the existing relay wire protocol over an HTTP/3 bidirectional stream via a length-prefix framing shim, reusing the WebSocket relay handshake and protocol negotiation unchanged. Opt-in only — `auto` does not select it yet. Requires an `https://` `relayUrl` and a WebTransport-capable relay.
