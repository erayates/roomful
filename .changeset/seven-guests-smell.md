---
'@roomful/core': minor
---

Add ephemeral rooms (`ephemeral` option). Blocks durable persistence (state, comments storage), optionally auto-disconnects after a TTL. `room.getRemainingTime()` returns ms until expiry.

Add `AuditLog` — a hash-chained, tamper-evident event log. `room.useAuditLog()` returns the log; room lifecycle events (connect, disconnect, peer join/leave) auto-record on first call. `log.verify()` detects tampering.

Add `docs/reference/security.md` covering threat model, encryption, relay trust, data retention, auth, and audit trail.
