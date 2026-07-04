import type { AIPeer, AIPeerAgent } from '@roomful/core';
import { addAIPeer, createHeuristicAgent } from '@roomful/core';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

import type { DemoPresence } from '../demo-types';

const REACTIONS = ['🎉', '❤️', '🔥', '😂', '👏', '🚀', '✨', '👀'];
const MOODS = ['🔥', '🚀', '😎', '🤝', '👀', '☕', '🎯', '🌊'];

/**
 * Wraps the lively heuristic agent with a human-in-the-loop cheer: every so often the bot *proposes*
 * a reaction instead of firing it, then fires it only once a human approves — showing off the
 * agent-approval workflow. While a proposal is pending it holds the `waiting-approval` state.
 */
function createDemoAgent(): AIPeerAgent<DemoPresence> {
  const heuristic = createHeuristicAgent({
    reactionEvent: 'reactions',
    reactions: REACTIONS.map((emoji) => ({ emoji })),
    moodField: 'mood',
    moods: MOODS,
  });
  let proposedId: string | null = null;

  return (context) => {
    void heuristic(context);

    const mine =
      proposedId !== null
        ? context.proposals.find((proposal) => proposal.id === proposedId)
        : undefined;

    if (mine?.status === 'pending') {
      // Re-assert the waiting state the heuristic just overwrote, so the UI shows we're blocked.
      context.setState('waiting-approval');
      return;
    }

    if (mine) {
      if (mine.status === 'approved') {
        context.emit('reactions', mine.payload);
        context.recordAction('cheer-applied', mine.payload);
      }
      proposedId = null;
      return;
    }

    if (context.tick > 0 && context.tick % 8 === 0) {
      const emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
      proposedId = context.propose('cheer', { emoji });
    }
  };
}

interface AITeammateProps {
  roomId: string;
  transport: 'broadcast' | 'websocket';
  relayUrl?: string | undefined;
}

/**
 * Adds/removes a headless AI teammate to the active room via `addAIPeer`. The
 * bot joins as a second participant — its cursor wanders, it reacts, sets a mood,
 * and proposes cheers for human approval — so any mini-app shows it as a live
 * collaborator, no second tab needed.
 */
export function AITeammate({ roomId, transport, relayUrl }: AITeammateProps): ReactElement {
  const [active, setActive] = useState(false);
  const peerRef = useRef<AIPeer | null>(null);

  const remove = useCallback(() => {
    void peerRef.current?.stop();
    peerRef.current = null;
    setActive(false);
  }, []);

  // Remove the bot when this unmounts (switching apps remounts the room).
  useEffect(() => remove, [remove]);

  const add = useCallback(() => {
    if (peerRef.current) {
      return;
    }

    peerRef.current = addAIPeer<DemoPresence>(roomId, {
      transport,
      ...(relayUrl ? { relayUrl } : {}),
      presence: { name: 'Roomy (AI)', color: '#a78bfa' },
      tickMs: 900,
      recordActions: true,
      observeEvents: ['reactions'],
      agent: createDemoAgent(),
    });
    setActive(true);
  }, [roomId, transport, relayUrl]);

  return (
    <button
      className={`button button--sm ${active ? 'button--ghost' : 'button--primary'}`}
      onClick={active ? remove : add}
      type="button"
    >
      {active ? '🤖 Remove AI teammate' : '🤖 Add AI teammate'}
    </button>
  );
}
