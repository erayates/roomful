---
'@roomful/relay': minor
---

Add an edge-runtime relay for Cloudflare Workers + Durable Objects. A new runtime-agnostic `EdgeRoom` engine runs one room's relay protocol over any WebSocket-like connection, and `verifyRelayJwtEdge` provides Web Crypto (HS256) JWT verification for runtimes without `node:crypto`. The `cloudflare` entry wires these into a `RoomDurableObject` (one Durable Object per room, so no Redis coordinator is needed) plus a Worker that routes each room to its object; deploy with the included `wrangler.jsonc`. The existing Node `createRelayServer` is unchanged, and clients connect with the same relay protocol.
