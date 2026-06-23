import { usePresence, useSharedState } from '@roomful/react';
import type { ReactElement } from 'react';

import type { DemoPresence } from '../demo-types';

const QUESTION = 'Which transport should we demo next?';
const OPTIONS = ['WebRTC mesh', 'WebSocket relay', 'BroadcastChannel'];

interface PollState {
  votes: Record<string, string>;
}

const EMPTY_POLL: PollState = { votes: {} };

export function PollApp(): ReactElement {
  const { self, all } = usePresence<DemoPresence>();
  const [state, setState] = useSharedState<PollState, DemoPresence>('poll', {
    initialValue: EMPTY_POLL,
    persist: false,
    strategy: 'crdt',
  });

  const myVote = state.votes[self.id];
  const total = Object.keys(state.votes).length;

  const vote = (option: string): void => {
    setState((current) => ({ votes: { ...current.votes, [self.id]: option } }));
  };

  return (
    <div className="poll-app">
      <h3 className="poll-question">{QUESTION}</h3>
      <div className="poll-options">
        {OPTIONS.map((option) => {
          const count = Object.values(state.votes).filter((value) => value === option).length;
          const pct = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <button
              aria-pressed={myVote === option}
              className="poll-option"
              key={option}
              onClick={() => {
                vote(option);
              }}
              type="button"
            >
              <span className="poll-option__bar" style={{ width: `${String(pct)}%` }} />
              <span className="poll-option__label">{option}</span>
              <span className="poll-option__count">
                {count} · {pct}%
              </span>
            </button>
          );
        })}
      </div>
      <p className="poll-hint">
        {total} of {all.length} here voted{myVote ? ` — you picked ${myVote}` : ''}. Open a second
        tab to vote as someone else.
      </p>
    </div>
  );
}
