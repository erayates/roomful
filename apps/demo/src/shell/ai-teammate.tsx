import type { AIPeer } from '@roomful/core';
import { addAIPeer, createHeuristicAgent } from '@roomful/core';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

import type { DemoPresence } from '../demo-types';

const REACTIONS = ['🎉', '❤️', '🔥', '😂', '👏', '🚀', '✨', '👀'];
const MOODS = ['🔥', '🚀', '😎', '🤝', '👀', '☕', '🎯', '🌊'];

interface AITeammateProps {
  roomId: string;
  transport: 'broadcast' | 'websocket';
  relayUrl?: string | undefined;
}

/**
 * Adds/removes a headless AI teammate to the active room via `addAIPeer`. The
 * bot joins as a second participant — its cursor wanders, it reacts, and it sets
 * a mood — so any mini-app shows it as a live collaborator, no second tab needed.
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
      agent: createHeuristicAgent({
        reactionEvent: 'reactions',
        reactions: REACTIONS.map((emoji) => ({ emoji })),
        moodField: 'mood',
        moods: MOODS,
      }),
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
