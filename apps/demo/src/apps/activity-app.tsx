import { createLocalStorageActivityStorage } from '@roomful/core';
import { useActivity, useRoom } from '@roomful/react';
import { type ReactElement, useMemo } from 'react';

import type { DemoPresence } from '../demo-types';

interface ActivityAction {
  type: string;
  icon: string;
  label: string;
}

const ACTIONS: readonly ActivityAction[] = [
  { type: 'demo:waved', icon: '👋', label: 'Wave' },
  { type: 'demo:shipped', icon: '🚀', label: 'Ship it' },
  { type: 'demo:focused', icon: '🎯', label: 'Focus' },
  { type: 'demo:coffee', icon: '☕', label: 'Coffee break' },
];

const LABELS: Record<string, string> = {
  'demo:waved': 'waved to the room',
  'demo:shipped': 'shipped something',
  'demo:focused': 'went heads-down',
  'demo:coffee': 'grabbed a coffee',
};

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) {
    return 'just now';
  }

  if (seconds < 60) {
    return `${String(seconds)}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)}m ago`;
  }

  return `${String(Math.round(minutes / 60))}h ago`;
}

function dotColor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  }

  return `hsl(${String(hash)}, 62%, 62%)`;
}

export function ActivityApp(): ReactElement {
  const room = useRoom<DemoPresence>();
  // Persist the feed to this browser so it survives a reload — a live demo of the
  // durable activity storage backend.
  const storageAdapter = useMemo(() => createLocalStorageActivityStorage(room.id), [room.id]);
  const { entries, record } = useActivity({ storageAdapter });
  const now = Date.now();

  return (
    <div className="activity-app">
      <div aria-label="Record activity" className="activity-actions" role="group">
        {ACTIONS.map((action) => (
          <button
            className="button button--ghost"
            key={action.type}
            onClick={() => {
              record(action.type);
            }}
            type="button"
          >
            <span aria-hidden="true">{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>

      <ol className="activity-feed">
        {entries.map((entry) => (
          <li className="activity-entry" key={entry.id}>
            <span
              aria-hidden="true"
              className="activity-entry__dot"
              style={{ background: dotColor(entry.actor.id) }}
            />
            <span className="activity-entry__body">
              <strong>{entry.actor.name ?? 'Someone'}</strong> {LABELS[entry.type] ?? entry.type}
            </span>
            <time className="activity-entry__time">{relativeTime(entry.timestamp, now)}</time>
          </li>
        ))}
        {entries.length === 0 ? (
          <li className="activity-entry activity-entry--empty">
            No activity yet — tap an action. Entries broadcast to everyone here and are saved
            locally, so a reload keeps them.
          </li>
        ) : null}
      </ol>
    </div>
  );
}
