---
'@roomful/core': minor
---

Add live agent presence states. An AI peer now announces what it is doing — `idle`, `thinking`, `typing`, `editing`, or `waiting-approval` — via a new `context.setState(...)` action that rides presence (no protocol change). Read it from any peer with `getAgentState(peer)` (exported alongside the `AgentState` type and `AGENT_STATE_KEY`). `createHeuristicAgent` now announces a lifelike state each tick, so demos show a live "thinking…/typing…" indicator out of the box.
