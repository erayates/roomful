import { useEvent, usePresence } from '@roomful/react';
import { type ReactElement, useState } from 'react';

import type { DemoPresence } from '../demo-types';

const EMOJIS = ['🎉', '❤️', '🔥', '😂', '👏', '🚀', '✨', '👀'];

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
}

export function ReactionsApp(): ReactElement {
  const { self, others } = usePresence<DemoPresence>();
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const spawn = (emoji: string): void => {
    const id = globalThis.crypto.randomUUID();
    const x = 6 + Math.random() * 88;
    setReactions((current) => [...current, { id, emoji, x }]);
    window.setTimeout(() => {
      setReactions((current) => current.filter((reaction) => reaction.id !== id));
    }, 2_600);
  };

  const emit = useEvent<{ emoji: string }, DemoPresence>('reactions', (payload, from) => {
    if (from.id === self.id) {
      return;
    }

    spawn(payload.emoji);
  });

  const fire = (emoji: string): void => {
    spawn(emoji);
    emit({ emoji });
  };

  return (
    <div className="reactions-app">
      <div aria-hidden="true" className="reactions-stage">
        {reactions.map((reaction) => (
          <span className="reaction" key={reaction.id} style={{ left: `${String(reaction.x)}%` }}>
            {reaction.emoji}
          </span>
        ))}
      </div>
      <div aria-label="Send a reaction" className="reactions-bar" role="group">
        {EMOJIS.map((emoji) => (
          <button
            aria-label={`Send ${emoji}`}
            className="reaction-btn"
            key={emoji}
            onClick={() => {
              fire(emoji);
            }}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
      <p className="reactions-hint">
        {others.length > 0
          ? 'Tap an emoji — it floats up on every screen here.'
          : 'Tap an emoji, then open a second tab to see reactions sync across the room.'}
      </p>
    </div>
  );
}
