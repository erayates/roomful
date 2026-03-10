# Advanced Features

Audience: users.

## WebRTC with Relay Signaling (Available Baseline)

```ts
import { createRoom } from '@flockjs/core';

const room = createRoom('doc-room', {
  transport: 'webrtc',
  relayUrl: 'ws://localhost:8787',
  relayAuth: async () => {
    const res = await fetch('/api/flock-token');
    const body = await res.json();
    return body.token;
  },
  stunUrls: ['stun:stun.l.google.com:19302'],
  webrtc: {
    iceGatherTimeoutMs: 5000,
    dataChannel: { ordered: true, protocol: 'flockjs-v1' },
  },
});
```

When `relayAuth` is configured, FlockJS appends the resolved token to the relay WebSocket URL as `?token=...` and keeps the join payload token-free.

## End-to-End Encryption

```ts
const room = createRoom('secure-room', {
  encryption: {
    algorithm: 'AES-GCM',
    passphrase: 'replace-with-secure-secret',
  },
});
```

Security notes:

- Distribute keys/passphrases out-of-band.
- Never hardcode production secrets in frontend code.
- End-to-end payload encryption semantics are planned for deeper EP-03/EP-05 implementation.

## Relay Signaling Server (`@flockjs/relay`)

```ts
import { createRelayServer, verifyJWT } from '@flockjs/relay';

const relay = createRelayServer({
  port: 8787,
  maxConnections: 1000,
  redisUrl: process.env.FLOCK_REDIS_URL,
}).auth(async (peerId, roomId, token) => {
  const claims = verifyJWT(token, process.env.RELAY_JWT_SECRET ?? '');
  if (claims.roomId !== roomId) {
    throw new Error(`Token cannot join room ${roomId}.`);
  }
});

await relay.start();
```

CLI startup:

```bash
flockjs-relay --host 0.0.0.0 --port 8787 --max-connections 1000
curl http://127.0.0.1:8787/health
```

Horizontal scaling with Redis:

```bash
FLOCK_REDIS_URL=redis://127.0.0.1:6379/0 \
flockjs-relay --host 0.0.0.0 --port 8787 --max-connections 1000
```

The relay package is the self-hostable baseline for both:

- WebRTC SDP/ICE signaling
- WebSocket room message relay
- shared-port health checks at `GET /health`

Relay runtime defaults and knobs:

- `HOST`: default `127.0.0.1`
- `PORT`: default `8787`
- `MAX_CONNECTIONS`: optional global concurrent WebSocket cap per relay instance
- `FLOCK_REDIS_URL`: optional Redis connection string; when set, relay room coordination switches to multi-instance mode automatically
- relay auth is disabled by default; unconfigured relays remain open
- when auth is enabled, clients must connect with a single non-empty `token` query param
- invalid upgrade-stage tokens are rejected with HTTP `401`
- join-time auth failures emit `AUTH_FAILED` and close the socket with code `4401`
- join attempts emit `REDIS_UNAVAILABLE` when Redis-backed coordination is configured but not currently ready

Docker runtime:

```bash
docker pull flockjs/relay:latest
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 flockjs/relay:latest
```

Redis-backed relay behavior:

- room membership is shared across relay instances
- peer join/leave notifications are forwarded through Redis room channels
- direct relay signaling and websocket transport frames are forwarded across instances
- existing same-instance sockets remain connected during transient Redis loss, but new joins are rejected until coordination recovers

WebSocket relay example:

```ts
const room = createRoom('doc-room', {
  transport: 'websocket',
  relayUrl: 'ws://localhost:8787',
  websocket: {
    fallbackTransport: 'polling',
  },
});
```

Polling fallback notes:

- fallback is opt-in on `transport: 'websocket'`
- fallback only applies during the initial connect/reconnect attempt when WebSocket is blocked or unavailable
- once fallback activates, that room instance stays on polling until you call `disconnect()`
- `auto` selection order is unchanged; polling is not a public transport mode

## Reconnection

```ts
const room = createRoom('my-room', {
  reconnect: {
    maxAttempts: 10,
    backoffMs: 500,
    backoffMultiplier: 1.5,
    maxBackoffMs: 30000,
  },
});
```

Automatic reconnection is opt-in. Set `reconnect: true` to use the default strategy, or pass an object to override:

- `maxAttempts`: default `5`
- `backoffMs`: default `100`
- `backoffMultiplier`: default `2`
- `maxBackoffMs`: default `2000`

Behavior:

- unexpected transport disconnects begin retrying within `500ms`
- retries use exponential backoff with internal jitter
- `reconnecting` fires for each retry attempt
- successful recovery emits `connected` again
- `disconnected` is deferred until retry exhaustion when auto reconnect is enabled
- room identity and local engine state are preserved across reconnect attempts

## CRDT with Yjs (Planned)

CRDT/Yjs runtime integration is not shipped in this baseline. Treat CRDT strategy references as forward-looking API direction.

## Auth Pattern

For private rooms in relay mode:

- validate `token` server-side with `relay.auth(...)`
- use `verifyJWT(token, secret)` for HS256 JWTs when you want a built-in helper
- map identity to peer metadata
- reject unauthorized joins before admission
- leave auth disabled for open rooms

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [Rooms and transports](../getting-started/rooms-and-transports.md)
- [Performance](performance.md)
- [Security policy](../../SECURITY.md)
- [Docs index](../README.md)
