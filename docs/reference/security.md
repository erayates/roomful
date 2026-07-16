# Security Model

Audience: app developers, operators, and security reviewers.

This page describes Roomful's runtime security model. For vulnerability reporting, supported versions, and disclosure expectations, see the root [Security Policy](../../SECURITY.md).

## Trust Boundaries

Roomful runs in applications that include browser clients, application servers, and optional relay infrastructure. Treat these boundaries explicitly:

- Browser clients are untrusted. They can request joins, send room payloads, and claim local UI state, but your application still owns authorization and durable side effects.
- Room IDs are identifiers, not secrets. Use relay authentication for private rooms.
- The relay routes signaling and room messages. Without Roomful encryption it can observe relayed application payloads. With Roomful encryption it sees routing metadata plus ciphertext.
- Peer metadata, presence, cursors, locks, pointer state, comments, activity, and AI actions originate from clients unless your app validates or records them server-side.
- Durable product actions should be authorized on your backend before they affect databases, billing, accounts, files, or permissions.

## Relay Authentication

Relay authentication is disabled by default so local development and open demos work without setup. Production private rooms should enable relay auth.

Enable built-in HS256 JWT verification with `ROOMFUL_AUTH_SECRET` or the relay `--auth-secret` option. Clients then connect with a single `token` query parameter, usually supplied through `relayAuth`:

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('project-123', {
  transport: 'websocket',
  relayUrl: 'wss://relay.example.com',
  relayAuth: async () => {
    const res = await fetch('/api/roomful-token');
    const { token } = await res.json();
    return token;
  },
});
```

Server-side token issuance should:

- sign tokens with the same secret configured on the relay
- set `sub` to the authenticated application user or service identity
- scope tokens to the target `roomId`
- use short expirations
- reject requests from users who cannot access the room

When relay auth is enabled, invalid upgrade-stage tokens are rejected with HTTP `401`. Join-time auth failures emit `AUTH_FAILED` and close the socket with code `4401`.

## End-to-End Encryption

Roomful supports optional application payload encryption:

```ts
import { createRoom } from '@roomful/core';

const room = createRoom('project-123', {
  encryption: {
    passphrase: 'load-from-your-own-secret-flow',
  },
});
```

Supported modes:

- `encryption: { passphrase }` derives a non-extractable AES-GCM key with PBKDF2-SHA-256 and room-scoped salt context.
- `encryption: { key }` accepts a pre-derived AES-GCM `CryptoKey`.

Encryption protects Roomful room payloads before they reach the transport layer. Presence, state, events, awareness, and CRDT sync payloads are encrypted when encryption is enabled.

Important limits:

- `hello` and `welcome` remain plaintext control messages so peers can negotiate encryption capability.
- All peers in a room must use compatible encryption settings and the same key material.
- Wrong keys or tampered payloads fail with diagnostics such as `ENCRYPTION_ERROR` or `DECRYPTION_ERROR`.
- Encryption does not replace room authorization, token scoping, backend validation, safe key distribution, or protection against compromised clients.
- Encryption does not hide relay metadata such as room IDs, connection timing, peer counts, or IP-level network metadata.

Never hardcode production passphrases or keys in frontend source code. Distribute room keys through your own authenticated server-side flow or another secure channel appropriate to your product.

## Relay Operation

For production relay deployments:

- run behind TLS and use `wss://` from browsers
- set `ROOMFUL_AUTH_SECRET` for private rooms
- restrict browser origins with `ROOMFUL_CORS_ORIGIN`
- configure `MAX_CONNECTIONS` and `ROOMFUL_MAX_ROOM_SIZE` for abuse containment
- monitor relay health through `GET /health`
- treat `ROOMFUL_REDIS_URL` multi-instance coordination as an operational dependency when enabled
- keep the relay image and npm packages on current patched versions

The relay is self-hostable through `@roomful/relay`, `roomful-relay`, or the published Docker image. Self-hosting lets you place Roomful routing inside your own network, observability, TLS, and incident response controls.

## Data Retention

Roomful has both ephemeral runtime state and optional durable features. Decide retention by feature:

- Ephemeral rooms disable durable storage and can auto-disconnect after a TTL.
- Presence, awareness, cursors, pointer state, and locks are runtime collaboration signals.
- Comments, activity feeds, recordings, exported `.roomful` sessions, and app-level storage adapters can persist data according to your application policy.
- Recording supports `redact` to remove sensitive frame data before storage.
- Recording supports `maxFrames` as a retention cap for in-memory frame history.

Roomful does not define your product's retention schedule. Your app should document where collaboration data is stored, who can access it, how long it is kept, and how deletion requests are handled.

## Audit Trail

`room.useAuditLog()` exposes a local audit trail for room lifecycle and peer activity events. The underlying `AuditLog` is hash-chained for tamper evidence:

```ts
const audit = room.useAuditLog();

audit.record('policy.updated', 'user-123', { role: 'editor' });

if (!audit.verify()) {
  throw new Error('Audit chain failed verification.');
}
```

Audit limits:

- The default audit log is in-memory.
- Entries are not durable unless your app exports or persists them.
- The built-in chain hash is deterministic and useful for local tamper evidence, but it is not a collision-resistant compliance log.

For regulated or high-assurance audit requirements, persist audit records server-side, bind them to authenticated users, use a collision-resistant hash such as SHA-256, and sign or timestamp log batches outside the browser.

## AI Actions

Roomful's activity and AI peer features can expose agent actions through the activity feed. Treat AI activity as product telemetry:

- record the authenticated user or service that authorized the action
- avoid putting secrets into prompts, room state, comments, or recordings
- review generated changes before they trigger durable side effects
- persist approvals and rejections in your own backend when they affect business-critical workflows

## Production Checklist

Before shipping private or sensitive collaboration flows:

- Use `wss://` relay URLs in production.
- Enable relay auth with `ROOMFUL_AUTH_SECRET` or `--auth-secret`.
- Mint short-lived, room-scoped JWTs server-side.
- Validate user access before issuing relay tokens.
- Restrict browser origins with `ROOMFUL_CORS_ORIGIN`.
- Configure connection and room-size caps.
- Enable Roomful encryption for sensitive room payloads.
- Keep encryption keys and passphrases out of frontend source code.
- Configure recording redaction and frame limits.
- Decide retention for comments, activity, recordings, and exported sessions.
- Monitor `AUTH_FAILED`, `ENCRYPTION_ERROR`, `DECRYPTION_ERROR`, and relay health.
- Use private vulnerability reporting for suspected security issues.

## Related Docs

- [Security Policy](../../SECURITY.md)
- [Advanced features](advanced.md)
- [Next.js auth tokens](auth-nextjs.md)
- [Auth with Firebase, Supabase, and custom backends](auth-providers.md)
- [Core API](core-api.md)
- [Recording engine](engines-recording.md)
- [Performance](performance.md)
