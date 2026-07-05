# ZK Rooms Feasibility RFC

**Status:** Draft, not implemented
**Scope:** EP-20 #204 — zero-knowledge room design for privacy-preserving collaboration.
**Target:** v2.8+ (post self-host trust, pre-cloud)

## Problem

Roomful rooms route all messages through a relay. Even with E2E encryption, the relay sees metadata: who is in the room, when they connect, message sizes and timing. For compliance-sensitive use cases (legal, medical, finance), metadata exposure is unacceptable.

A ZK room would prove to the relay that messages are valid without revealing their contents or participants.

## Constraints

1. **Browser-compatible.** No native crypto beyond Web Crypto API.
2. **Real-time.** Latency under 100ms for presence/cursor updates.
3. **Relay simplicity.** The relay is a message router — ZK proofs must not require relay-side computation.
4. **Opt-in.** ZK rooms are a feature flag, not a protocol change.

## Approach: ZK Proof of Message Validity

The relay needs to know only two things about each message:

1. Is it from an authorized peer? (auth)
2. Does it follow room rules? (rate limits, content size)

A ZK-SNARK could prove both without revealing the peer identity or message content. But:

### Feasibility Assessment

| Concern                         | Status                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Proof generation in browser** | SNARK provers (Groth16, PLONK) require 100MB+ WASM and 10-30s per proof on a mid-range device. Not real-time viable.                      |
| **Circuit complexity**          | The "message is valid" circuit would need to encode the entire signaling protocol. Estimated 100K+ constraints — weeks of circuit design. |
| **Library maturity**            | No production-grade WASM SNARK library exists for browsers. `snarkjs` works but is slow and unmaintained.                                 |
| **Key management**              | Trusted setup ceremony required for Groth16. Transparent setups (STARKs) have 100KB+ proofs — too large for WebSocket frames.             |
| **Latency**                     | 10-30s proof time vs. 100ms latency target. **Blocked on proving time.**                                                                  |

## Recommendation: Do Not Implement

ZK for real-time collaboration is not feasible on 2026 browser hardware. The proving time alone makes it a non-starter for presence/cursor traffic.

## Alternative: Ephemeral + Self-Host

The pragmatic path to metadata privacy:

1. **Self-host the relay** — metadata stays in your network. Already supported.
2. **Ephemeral rooms** (`ephemeral: true`) — no durable storage. Done (EP-20 #203).
3. **Audit log** — tamper-evident verification that no data leaked. Done (EP-20 #202).

This covers 95% of compliance use cases without ZK complexity.

## When to Revisit

- When browser WASM SNARK provers reach sub-second proving time with <1MB bundles.
- When a customer with a legal mandate for ZK collaboration offers to fund the work.
- When homomorphic encryption matures as an alternative (no proving step, but similar latency challenges).
