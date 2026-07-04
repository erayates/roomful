import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
});

describe('AgentApprovalEngine', () => {
  it('creates a pending proposal that the proposer can approve', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('approvals-local');
    const approvals = room.useAgentApprovals();

    const proposal = approvals.propose({ type: 'clear-canvas', payload: { scope: 'all' } });
    expect(proposal.status).toBe('pending');
    expect(proposal.type).toBe('clear-canvas');
    expect(proposal.payload).toEqual({ scope: 'all' });
    expect(proposal.proposer.id).toBe(room.peerId);
    expect(approvals.getPending().map((entry) => entry.id)).toEqual([proposal.id]);

    approvals.approve(proposal.id);
    const [decided] = approvals.getProposals();
    expect(decided?.status).toBe('approved');
    expect(decided?.decidedBy?.id).toBe(room.peerId);
    expect(approvals.getPending()).toEqual([]);
  });

  it('lets a human approve an agent proposal across peers', async () => {
    harness = await createMockRoomHarness();
    const agentRoom = harness.createRoom('approvals-shared');
    const humanRoom = harness.createRoom('approvals-shared');
    const agentApprovals = agentRoom.useAgentApprovals();
    const humanApprovals = humanRoom.useAgentApprovals();
    await agentRoom.connect();
    await humanRoom.connect();

    const proposal = agentApprovals.propose({ type: 'set-title', payload: 'New' });

    // The human sees the pending proposal, then approves it.
    await harness.waitFor(() => humanApprovals.getPending().length === 1);
    humanApprovals.approve(proposal.id);

    // The agent side converges on approved, attributed to the human.
    await harness.waitFor(() => agentApprovals.getProposals()[0]?.status === 'approved');
    const [decided] = agentApprovals.getProposals();
    expect(decided?.decidedBy?.id).toBe(humanRoom.peerId);
  });

  it('reject marks the proposal rejected', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('approvals-reject');
    const approvals = room.useAgentApprovals();

    const proposal = approvals.propose({ type: 'delete-record' });
    approvals.reject(proposal.id);
    expect(approvals.getProposals()[0]?.status).toBe('rejected');
  });

  it('ignores a second decision — the first one wins', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('approvals-first-wins');
    const approvals = room.useAgentApprovals();

    const proposal = approvals.propose({ type: 'x' });
    approvals.approve(proposal.id);
    approvals.reject(proposal.id);
    expect(approvals.getProposals()[0]?.status).toBe('approved');
  });

  it('canDecide gates who may decide', async () => {
    harness = await createMockRoomHarness();
    const room = harness.createRoom('approvals-permission');
    const approvals = room.useAgentApprovals({ canDecide: () => false });

    const proposal = approvals.propose({ type: 'y' });
    approvals.approve(proposal.id);
    expect(approvals.getProposals()[0]?.status).toBe('pending');
  });
});
