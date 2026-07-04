import { describe, expect, it } from 'vitest';

import { AGENT_IDENTITY_KEY } from '../ai-peer';
import type { ActivityEntry, Peer } from '../types';
import { summarizeSession } from './session-summary';

function human(id: string): Peer {
  return { id, joinedAt: 0, lastSeen: 0, name: id };
}

function agent(id: string): Peer {
  return { id, joinedAt: 0, lastSeen: 0, name: id, [AGENT_IDENTITY_KEY]: { kind: 'ai' } };
}

function entry(id: string, type: string, actor: Peer, timestamp: number): ActivityEntry {
  return { id, type, actor, timestamp };
}

describe('summarizeSession', () => {
  it('summarizes an empty feed', () => {
    const summary = summarizeSession([]);
    expect(summary.eventCount).toBe(0);
    expect(summary.participants).toEqual([]);
    expect(summary.startedAt).toBeNull();
    expect(summary.durationMs).toBe(0);
    expect(summary.text).toBe('No activity yet.');
  });

  it('counts events, participants, actions, and the time span', () => {
    const ada = human('ada');
    const bot = agent('bot');
    const entries: ActivityEntry[] = [
      entry('1', 'stroke', ada, 1_000),
      entry('2', 'stroke', ada, 2_000),
      entry('3', 'agent:cheer', bot, 5_000),
    ];

    const summary = summarizeSession(entries);
    expect(summary.eventCount).toBe(3);
    expect(summary.agentActionCount).toBe(1);
    expect(summary.humanActionCount).toBe(2);
    expect(summary.actionCounts).toEqual({ stroke: 2, 'agent:cheer': 1 });
    expect(summary.startedAt).toBe(1_000);
    expect(summary.endedAt).toBe(5_000);
    expect(summary.durationMs).toBe(4_000);

    // Participants are most-active first, and the agent is flagged.
    expect(summary.participants.map((participant) => participant.peer.id)).toEqual(['ada', 'bot']);
    expect(summary.participants[0]?.eventCount).toBe(2);
    expect(summary.participants.find((participant) => participant.peer.id === 'bot')?.isAgent).toBe(
      true,
    );
    expect(summary.text).toContain('3 events');
    expect(summary.text).toContain('2 participants');
  });

  it('uses a custom narrate hook when provided', () => {
    const entries: ActivityEntry[] = [entry('1', 'x', human('ada'), 1_000)];
    const summary = summarizeSession(entries, {
      narrate: (base) => `narrated: ${String(base.eventCount)}`,
    });
    expect(summary.text).toBe('narrated: 1');
  });
});
