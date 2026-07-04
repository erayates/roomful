---
'@roomful/svelte': minor
---

Add the `agentApprovals` store binding for `room.useAgentApprovals`. The store is a readable of every proposal (newest first) augmented with a reactive `pending` sub-store and the `approve`, `reject`, and `propose` actions, so a Svelte UI can present an agent's proposed actions and let a human approve or reject them.
