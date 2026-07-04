---
'@roomful/core': minor
---

Add an AI agent identity model. `addAIPeer` now stamps every AI peer with a detectable identity that rides the presence channel (no protocol change), and a new `identity` option declares its `role`/`disclosure`. Any peer can detect and describe an agent with the new `isAgentPeer(peer)` / `getAgentIdentity(peer)` helpers (exported alongside `AgentIdentity` and `AGENT_IDENTITY_KEY`). This is the foundation for agent-aware UIs and downstream agent collaboration features.
