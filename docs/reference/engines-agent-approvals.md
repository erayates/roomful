# Agent approvals engine

Audience: users.

Agent approvals put a **human in the loop** for AI actions: an agent _proposes_ an action instead
of applying it, and a human _approves_ or _rejects_ it — so AI actions are inspectable before they
commit. Proposals and decisions sync to every peer over a reserved event channel, so the whole room
sees the same pending list. Pairs with AI peers: an agent calls `context.propose(...)` (which sets
its `waiting-approval` state) and applies the action once it sees its proposal approved.

## Access

```ts
const approvals = room.useAgentApprovals();
```

## Interface

```ts
interface AgentApprovalEngine {
  propose(input: { type: string; payload?: unknown }): AgentProposal; // create a pending proposal
  approve(id: string): void; // decide (if permitted), broadcast
  reject(id: string): void;
  getProposals(): AgentProposal[]; // all, newest first
  getPending(): AgentProposal[]; // status === 'pending'
  subscribe(callback: (proposals: AgentProposal[]) => void): Unsubscribe;
}

interface AgentProposal {
  id: string;
  proposer: Peer; // the agent, with live presence
  type: string; // app-defined, e.g. 'clear-canvas' or 'set-field'
  payload?: unknown;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: number;
  decidedBy?: Peer; // who approved/rejected, once decided
}

interface AgentApprovalOptions {
  // Gate who may decide. Returns true to allow the local peer. Defaults to everyone.
  canDecide?: (proposal: AgentProposal, self: Peer) => boolean;
}
```

## Semantics

- **First decision wins** — once a proposal is approved or rejected, later or duplicate decisions are
  ignored, so every peer converges on the same outcome.
- **`canDecide` is a cooperative UI gate** — it controls whether the local peer's `approve`/`reject`
  do anything. The real enforcement point is the proposer: it re-checks `decidedBy` before it applies
  an approved action.
- **Rides the event channel** — no relay or protocol change; proposals are transient (not persisted).

## Adapters

| Adapter | Binding                                                                            |
| ------- | ---------------------------------------------------------------------------------- |
| React   | `useAgentApprovals(opts?)` → `{ proposals, pending, approve, reject, propose }`    |
| Vue     | `useAgentApprovals(opts?)` → `{ proposals, pending, approve, reject, propose }`    |
| Solid   | `useAgentApprovals(opts?)` → `{ proposals, pending, approve, reject, propose }`    |
| Svelte  | `agentApprovals` store (+ `pending` sub-store, `approve`/`reject`/`propose`)       |
| Angular | `injectAgentApprovals(opts?)` → `{ proposals, pending, approve, reject, propose }` |

## Related docs

- [Activity engine](engines-activity.md) — the agent action log that pairs with approvals.
- [Session summarizer](session-summarizer.md) — summarize what happened, including agent actions.
