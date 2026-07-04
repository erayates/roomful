import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../test-utils/mock-room';
import {
  AGENT_IDENTITY_KEY,
  type AIPeer,
  type AIPeerContext,
  createHeuristicAgent,
  getAgentIdentity,
  isAgentPeer,
} from './ai-peer';
import type { Peer } from './types';

let harness: MockRoomHarness | null = null;
let aiPeer: AIPeer | null = null;

afterEach(async () => {
  await aiPeer?.stop();
  aiPeer = null;
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

interface DemoPresence {
  name: string;
}

describe('addAIPeer', () => {
  it('joins as a second peer and its agent acts (emit, cursor, presence)', async () => {
    harness = await createMockRoomHarness();
    // Dynamic import AFTER the harness mocks the transport, so addAIPeer's own
    // createRoom resolves to the mocked in-memory network the human is on.
    const { addAIPeer } = await import('./ai-peer');

    const human = harness.createRoom<DemoPresence>('ai-room', { presence: { name: 'Human' } });
    await human.connect();

    const received: number[] = [];
    human.useEvents().on('ai-hello', (payload: { tick: number }) => {
      received.push(payload.tick);
    });

    aiPeer = addAIPeer<DemoPresence>('ai-room', {
      transport: 'websocket',
      presence: { name: 'AI Bot' },
      tickMs: 100_000, // large — only the on-connect tick fires within the test
      agent: (context) => {
        context.emit('ai-hello', { tick: context.tick });
        context.moveCursor(0.5, 0.4);
        context.setPresence({ name: 'AI Bot' });
      },
    });

    const botId = aiPeer.peerId;

    // The agent runs once on connect → the human receives its event.
    await harness.waitFor(() => received.length > 0);

    // The bot is a real peer the human can see, with its presence name.
    expect(human.peers.some((peer) => peer.id === botId)).toBe(true);
    expect(human.peers.some((peer) => peer.name === 'AI Bot')).toBe(true);

    // Its programmatic cursor (no DOM) reached the human.
    await harness.waitFor(() =>
      human
        .useCursors()
        .getPositions()
        .some((cursor) => cursor.userId === botId),
    );
  });

  it('stamps the AI peer with a detectable agent identity every peer can see', async () => {
    harness = await createMockRoomHarness();
    const { addAIPeer } = await import('./ai-peer');

    const human = harness.createRoom<DemoPresence>('ai-identity-room', {
      presence: { name: 'Human' },
    });
    await human.connect();

    aiPeer = addAIPeer<DemoPresence>('ai-identity-room', {
      transport: 'websocket',
      presence: { name: 'AI Bot' },
      identity: { role: 'assistant', disclosure: 'Demo AI' },
      tickMs: 100_000,
      agent: () => undefined,
    });
    const botId = aiPeer.peerId;

    await harness.waitFor(() => human.peers.some((peer) => peer.id === botId));
    const bot = human.peers.find((peer) => peer.id === botId);
    expect(bot !== undefined && isAgentPeer(bot)).toBe(true);
    expect(bot !== undefined ? getAgentIdentity(bot) : null).toEqual({
      kind: 'ai',
      role: 'assistant',
      disclosure: 'Demo AI',
    });

    // The human is not an agent.
    expect(isAgentPeer(human.usePresence().getSelf())).toBe(false);
  });

  it('stop() removes the AI peer from the room', async () => {
    harness = await createMockRoomHarness();
    const { addAIPeer } = await import('./ai-peer');

    const human = harness.createRoom('ai-room-stop');
    await human.connect();

    const peer = addAIPeer('ai-room-stop', {
      transport: 'websocket',
      agent: () => undefined,
    });
    await harness.waitFor(() => human.peerCount === 1);

    await peer.stop();
    await harness.waitFor(() => human.peerCount === 0);
  });
});

describe('createHeuristicAgent', () => {
  it('moves the cursor every tick and reacts / sets a mood periodically', () => {
    const agent = createHeuristicAgent({
      reactionEvent: 'reactions',
      reactions: [{ emoji: '🎉' }],
      moodField: 'mood',
      moods: ['🔥'],
      reactEveryTicks: 2,
    });

    let moves = 0;
    let emits = 0;
    let presences = 0;
    const makeContext = (tick: number): AIPeerContext => ({
      tick,
      self: { id: 'bot', joinedAt: 0, lastSeen: 0, name: 'Bot' },
      others: [],
      cursors: [],
      events: [],
      moveCursor: () => {
        moves += 1;
      },
      setPresence: () => {
        presences += 1;
      },
      emit: () => {
        emits += 1;
      },
    });

    for (let tick = 0; tick < 4; tick += 1) {
      void agent(makeContext(tick));
    }

    expect(moves).toBe(4); // cursor moves on every tick
    expect(emits).toBeGreaterThan(0); // reacts on the periodic ticks
    expect(presences).toBeGreaterThan(0); // sets a mood on tick 0
  });
});

describe('getAgentIdentity / isAgentPeer', () => {
  it('reads the identity from a marked peer and null from a human', () => {
    const human: Peer = { id: 'h', joinedAt: 0, lastSeen: 0, name: 'Ada' };
    expect(getAgentIdentity(human)).toBeNull();
    expect(isAgentPeer(human)).toBe(false);

    const agent: Peer = {
      id: 'a',
      joinedAt: 0,
      lastSeen: 0,
      name: 'Bot',
      [AGENT_IDENTITY_KEY]: { kind: 'ai', role: 'assistant', disclosure: 'AI assistant' },
    };
    expect(isAgentPeer(agent)).toBe(true);
    expect(getAgentIdentity(agent)).toEqual({
      kind: 'ai',
      role: 'assistant',
      disclosure: 'AI assistant',
    });
  });

  it('ignores malformed or non-ai markers, and drops wrong-typed fields', () => {
    const notAi: Peer = {
      id: 'x',
      joinedAt: 0,
      lastSeen: 0,
      [AGENT_IDENTITY_KEY]: { kind: 'human' },
    };
    expect(getAgentIdentity(notAi)).toBeNull();

    const garbage: Peer = { id: 'y', joinedAt: 0, lastSeen: 0, [AGENT_IDENTITY_KEY]: 'nope' };
    expect(getAgentIdentity(garbage)).toBeNull();

    const wrongTypes: Peer = {
      id: 'z',
      joinedAt: 0,
      lastSeen: 0,
      [AGENT_IDENTITY_KEY]: { kind: 'ai', role: 42, disclosure: null },
    };
    expect(getAgentIdentity(wrongTypes)).toEqual({ kind: 'ai' });
  });
});
