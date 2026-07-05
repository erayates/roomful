---
'@roomful/core': minor
---

Add `room.getUsageMetrics()` for telemetry. Unlike the point-in-time `getDiagnostics()` snapshot, it returns cumulative counters for the room's lifetime that survive reconnects — `connectCount` (sessions), `reconnectCount`, `peakRemotePeerCount`, and message counters (`messagesSent`/`messagesReceived`/`broadcastsSent`/`directSends`) — so an app can feed room usage to analytics. Exports the new `UsageMetrics` type.
