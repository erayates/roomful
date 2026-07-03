import { RoomfulProvider, useConnectionStatus, useCursors, usePresence } from '@roomful/react';
import { type ReactElement } from 'react';

import { type InteropConfig, resolveInteropConfig } from './config';

type InteropPresence = {
  name: string;
  color: string;
};

const config = resolveInteropConfig(window.location);

export function App(): ReactElement {
  return (
    <RoomfulProvider<InteropPresence>
      presence={{ name: config.name, color: config.color }}
      relayUrl={config.relayUrl}
      roomId={config.roomId}
      transport="websocket"
    >
      <Stage config={config} />
    </RoomfulProvider>
  );
}

function Stage({ config }: { config: InteropConfig }): ReactElement {
  const status = useConnectionStatus();
  const { self, others } = usePresence<InteropPresence>();
  const { ref, cursors } = useCursors();
  const peers = [self, ...others];

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">Roomful · Cross-platform interop</span>
        <span className="meta">
          <span className={`status status--${status}`}>{status}</span>
          <span className="room">room: {config.roomId}</span>
          <span className="count">{peers.length} online</span>
        </span>
      </header>

      <div className="stage" ref={ref}>
        {cursors.map((cursor) => (
          <span
            className="cursor"
            key={cursor.userId}
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          >
            <span className="cursor__dot" style={{ background: cursor.color }} />
            <span className="cursor__label" style={{ background: cursor.color }}>
              {cursor.name.length > 0 ? cursor.name : cursor.userId}
            </span>
          </span>
        ))}
        <p className="stage__hint">
          Move your cursor here. Join the same room from a Flutter (or another web) client to watch
          presence and cursors sync across platforms over the relay.
        </p>
      </div>

      <footer className="roster">
        {peers.map((peer) => (
          <span
            className={peer.id === self.id ? 'avatar avatar--self' : 'avatar'}
            key={peer.id}
            style={{ background: peer.color ?? '#5cc7ab' }}
            title={`${peer.name ?? peer.id}${peer.id === self.id ? ' (you)' : ''}`}
          >
            {initials(peer.name ?? peer.id)}
          </span>
        ))}
      </footer>
    </div>
  );
}

function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0] ?? value;
  if (parts.length >= 2) {
    const second = parts[1] ?? '';
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  return first.slice(0, 2).toUpperCase();
}
