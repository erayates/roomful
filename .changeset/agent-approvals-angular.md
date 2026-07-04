---
'@roomful/angular': minor
---

Add the `injectAgentApprovals` binding for `room.useAgentApprovals`. It returns a reactive `proposals` signal (every proposal, newest first) plus a derived `pending` signal and the `approve`, `reject`, and `propose` actions, so an Angular UI can present an agent's proposed actions and let a human approve or reject them.
