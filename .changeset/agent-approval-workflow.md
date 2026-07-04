---
'@roomful/core': minor
---

Add a human-in-the-loop agent approval workflow. Agents can now `propose` an action instead of applying it, and humans `approve` or `reject` it — so AI actions are inspectable before they commit. New `room.useAgentApprovals(options?)` engine (propose/approve/reject/getProposals/getPending/subscribe) rides a reserved event channel and syncs proposals to every peer, with a `canDecide` permission hook. AI peers get a `context.propose(type, payload?)` action (which sets the `waiting-approval` state) and see live proposals via `context.proposals`, so an agent can apply an action once it's approved. Exports `AgentProposal`, `AgentProposalStatus`, `AgentApprovalEngine`, and `AgentApprovalOptions`.
