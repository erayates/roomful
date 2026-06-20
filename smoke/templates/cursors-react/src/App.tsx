import {
  CollaborationBadge,
  FloatingReaction,
  LiveIndicator,
  PeerCursor,
  PresenceAvatars,
  PresenceBar,
  SelectionHighlight,
  TypingIndicator,
} from '@cahoots/cursors';
import { CahootsProvider, usePresence } from '@cahoots/react';

type SmokePresence = {
  color: string;
  name: string;
};

function CursorSurface() {
  const presence = usePresence<SmokePresence>();
  const peer = presence.self;

  return (
    <div style={{ minHeight: 240, padding: 24, position: 'relative' }}>
      <div id="selection-target">Publish smoke selection target</div>
      <CollaborationBadge peer={peer} />
      <FloatingReaction emoji="🔥" x={0.5} y={0.5} />
      <LiveIndicator />
      <PeerCursor
        color={peer.color ?? '#0ea5e9'}
        idle={false}
        name={peer.name ?? 'Cursor Smoke'}
        style="arrow"
        x={0.25}
        y={0.35}
      />
      <PresenceAvatars maxVisible={4} />
      <PresenceBar maxVisible={4} showNames />
      <SelectionHighlight
        peer={peer}
        selection={{ elementId: 'selection-target', from: 0, to: 6 }}
      />
      <TypingIndicator peers={presence.all} />
    </div>
  );
}

export function App() {
  return (
    <CahootsProvider
      presence={{ color: '#0ea5e9', name: 'Cursor Smoke' }}
      roomId="publish-smoke-cursors"
    >
      <CursorSurface />
    </CahootsProvider>
  );
}
