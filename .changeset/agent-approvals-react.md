---
'@roomful/react': minor
---

Add the `useAgentApprovals` hook binding `room.useAgentApprovals`. It returns the reactive proposal list (`proposals` and `pending`, newest first) plus `approve`, `reject`, and `propose`, so a React UI can present an agent's proposed actions and let a human approve or reject them.
