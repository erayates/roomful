import { isObject, readNumber, readString } from '../internal/guards';
import { cloneStateValue } from '../internal/state';
import type {
  AgentApprovalEngine,
  AgentApprovalOptions,
  AgentProposal,
  AgentProposalStatus,
  Peer,
  Unsubscribe,
} from '../types';

/**
 * The wire shape broadcast for a proposed action. The `proposer` is resolved from the broadcasting
 * peer's id on receipt, so proposals always carry live presence.
 */
export interface AgentProposalFrame {
  id: string;
  type: string;
  timestamp: number;
  payload?: unknown;
}

/**
 * The wire shape broadcast for a decision on a proposal. The decider is resolved from the
 * broadcasting peer's id on receipt.
 */
export interface AgentDecisionFrame {
  id: string;
  status: 'approved' | 'rejected';
  timestamp: number;
}

/**
 * Wires the agent-approval engine to the room runtime: the local peer id, a peer resolver (so
 * proposals and decisions carry presence), and the broadcast/receive channels.
 */
export interface AgentApprovalEngineContext {
  readonly selfPeerId: string;
  getPeer(peerId: string): Peer | null;
  broadcastProposal(frame: AgentProposalFrame): void;
  broadcastDecision(frame: AgentDecisionFrame): void;
  onRemoteProposal(handler: (peerId: string, frame: AgentProposalFrame) => void): void;
  onRemoteDecision(handler: (peerId: string, frame: AgentDecisionFrame) => void): void;
  now?: () => number;
}

/**
 * Parses an inbound proposal payload into a typed frame, or `null` when malformed, so a bad remote
 * broadcast can never corrupt the proposal list.
 *
 * @param payload - The raw event payload.
 * @returns The typed frame, or `null`.
 */
export function parseAgentProposalFrame(payload: unknown): AgentProposalFrame | null {
  if (!isObject(payload)) {
    return null;
  }

  const id = readString(payload, 'id');
  const type = readString(payload, 'type');
  const timestamp = readNumber(payload, 'timestamp');
  if (id === undefined || type === undefined || timestamp === undefined) {
    return null;
  }

  const frame: AgentProposalFrame = { id, type, timestamp };
  const value = Reflect.get(payload, 'payload');
  if (value !== undefined) {
    frame.payload = value;
  }

  return frame;
}

/**
 * Parses an inbound decision payload into a typed frame, or `null` when malformed.
 *
 * @param payload - The raw event payload.
 * @returns The typed frame, or `null`.
 */
export function parseAgentDecisionFrame(payload: unknown): AgentDecisionFrame | null {
  if (!isObject(payload)) {
    return null;
  }

  const id = readString(payload, 'id');
  const status = readString(payload, 'status');
  const timestamp = readNumber(payload, 'timestamp');
  if (
    id === undefined ||
    timestamp === undefined ||
    (status !== 'approved' && status !== 'rejected')
  ) {
    return null;
  }

  return { id, status, timestamp };
}

/**
 * Creates an agent-approval engine bound to a room. Agents `propose` actions (broadcast as
 * `pending`); humans `approve`/`reject` them (broadcast as a decision); every peer converges on the
 * same proposal list. A decision is applied once — the first one wins — and gated by
 * {@link AgentApprovalOptions.canDecide}.
 *
 * @param context - The room runtime bindings.
 * @param createId - Generates ids for new proposals.
 * @param options - Optional configuration (permission hook).
 * @returns The agent-approval engine bound to the room.
 */
export function createAgentApprovalEngine(
  context: AgentApprovalEngineContext,
  createId: () => string,
  options?: AgentApprovalOptions,
): AgentApprovalEngine {
  const now = context.now ?? Date.now;
  const proposals = new Map<string, AgentProposal>();
  const subscribers = new Set<(proposals: AgentProposal[]) => void>();

  const resolvePeer = (peerId: string): Peer => {
    return context.getPeer(peerId) ?? { id: peerId, joinedAt: 0, lastSeen: 0 };
  };

  const ordered = (): AgentProposal[] => {
    // Newest first; ties broken by id for a stable order.
    return [...proposals.values()].sort((left, right) => {
      if (left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp;
      }

      return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
    });
  };

  const snapshot = (): AgentProposal[] => {
    return ordered().map((proposal) => cloneStateValue(proposal));
  };

  const notify = (): void => {
    const current = snapshot();
    for (const subscriber of subscribers) {
      subscriber(current);
    }
  };

  const applyDecision = (id: string, status: AgentProposalStatus, decider: Peer): boolean => {
    const proposal = proposals.get(id);
    if (!proposal || proposal.status !== 'pending') {
      // First decision wins; a later or duplicate decision is ignored.
      return false;
    }

    proposal.status = status;
    proposal.decidedBy = decider;
    notify();
    return true;
  };

  const decideLocal = (id: string, status: 'approved' | 'rejected'): void => {
    const proposal = proposals.get(id);
    if (!proposal || proposal.status !== 'pending') {
      return;
    }

    const self = resolvePeer(context.selfPeerId);
    if (options?.canDecide && !options.canDecide(cloneStateValue(proposal), self)) {
      return;
    }

    if (applyDecision(id, status, self)) {
      context.broadcastDecision({ id, status, timestamp: now() });
    }
  };

  context.onRemoteProposal((peerId, frame) => {
    if (proposals.has(frame.id)) {
      return;
    }

    const proposal: AgentProposal = {
      id: frame.id,
      proposer: resolvePeer(peerId),
      type: frame.type,
      status: 'pending',
      timestamp: frame.timestamp,
    };
    if (frame.payload !== undefined) {
      proposal.payload = frame.payload;
    }

    proposals.set(frame.id, proposal);
    notify();
  });

  context.onRemoteDecision((peerId, frame) => {
    applyDecision(frame.id, frame.status, resolvePeer(peerId));
  });

  return {
    propose({ type, payload }): AgentProposal {
      const proposal: AgentProposal = {
        id: createId(),
        proposer: resolvePeer(context.selfPeerId),
        type,
        status: 'pending',
        timestamp: now(),
      };
      if (payload !== undefined) {
        proposal.payload = payload;
      }

      proposals.set(proposal.id, proposal);
      const frame: AgentProposalFrame = {
        id: proposal.id,
        type: proposal.type,
        timestamp: proposal.timestamp,
      };
      if (payload !== undefined) {
        frame.payload = payload;
      }

      context.broadcastProposal(frame);
      notify();
      return cloneStateValue(proposal);
    },
    approve(id): void {
      decideLocal(id, 'approved');
    },
    reject(id): void {
      decideLocal(id, 'rejected');
    },
    getProposals(): AgentProposal[] {
      return snapshot();
    },
    getPending(): AgentProposal[] {
      return snapshot().filter((proposal) => proposal.status === 'pending');
    },
    subscribe(callback): Unsubscribe {
      subscribers.add(callback);
      callback(snapshot());
      return () => {
        subscribers.delete(callback);
      };
    },
  };
}
