---
'@roomful/solid': minor
---

Add the `useAgentApprovals` binding for `room.useAgentApprovals`. It returns the reactive proposal list as Solid accessors (`proposals` and derived `pending`, newest first) plus `approve`, `reject`, and `propose`, so a SolidJS UI can present an agent's proposed actions and let a human approve or reject them.
