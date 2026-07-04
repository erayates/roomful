---
'@roomful/core': minor
---

Add a structured agent action stream. AI peers can now log their actions to the room's activity feed — auditable, replayable, and synced to every peer. New `context.recordAction(type, payload?)` records an explicit action; the new `recordActions` option on `addAIPeer` auto-records the semantic actions an agent takes (events it emits, presence patches it applies). Read the log back anywhere with `getAgentActions(entries)` (exported with `AGENT_ACTION_PREFIX`), which filters an activity feed down to agent-authored entries. Reuses the existing activity engine — no new wire protocol.
