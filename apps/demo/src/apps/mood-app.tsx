import { usePresence } from '@roomful/react';
import type { ReactElement } from 'react';

import type { DemoPresence } from '../demo-types';

const MOODS = ['🔥', '🚀', '😎', '🤝', '👀', '☕', '🎯', '🌊'];

function readMood(value: unknown): string {
  return typeof value === 'string' ? value : '👋';
}

export function MoodApp(): ReactElement {
  const { self, all, update } = usePresence<DemoPresence>();
  const myMood = readMood(self.mood);

  return (
    <div className="mood-app">
      <div aria-label="Set your vibe" className="mood-picker" role="group">
        {MOODS.map((mood) => (
          <button
            aria-label={`Set vibe ${mood}`}
            aria-pressed={mood === myMood}
            className="mood-btn"
            key={mood}
            onClick={() => {
              update({ mood });
            }}
            type="button"
          >
            {mood}
          </button>
        ))}
      </div>

      <div className="mood-grid">
        {all.map((peer) => (
          <div className="mood-card" key={peer.id} style={{ borderColor: peer.color }}>
            <span className="mood-emoji">{readMood(peer.mood)}</span>
            <span className="mood-name">
              {peer.name}
              {peer.id === self.id ? ' (you)' : ''}
            </span>
          </div>
        ))}
      </div>

      <p className="mood-hint">
        Pick a vibe — it updates your presence for everyone here. Open a second tab to add another
        person to the grid.
      </p>
    </div>
  );
}
