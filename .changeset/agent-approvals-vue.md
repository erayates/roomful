---
'@roomful/vue': minor
---

Add the `useAgentApprovals` binding for `room.useAgentApprovals`. It returns a reactive `proposals` ref (every proposal, newest first) plus a derived `pending` ref and the `approve`, `reject`, and `propose` actions, so a Vue UI can present an agent's proposed actions and let a human approve or reject them.
