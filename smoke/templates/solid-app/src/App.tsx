import {
  RoomfulProvider,
  useAwareness,
  useConnectionStatus,
  usePresence,
  useRoom,
  useSharedState,
} from '@roomful/solid';
import type { JSX } from 'solid-js';

type SmokePresence = {
  color: string;
  name: string;
};

function SmokePanel(): JSX.Element {
  const room = useRoom<SmokePresence>();
  const presence = usePresence<SmokePresence>();
  const awareness = useAwareness();
  const status = useConnectionStatus();
  const [sharedState] = useSharedState('solid-smoke-state', {
    initialValue: { count: 1 },
    strategy: 'lww',
  });

  return (
    <pre>
      {JSON.stringify(
        {
          awareness: awareness.others().length,
          canConnect: typeof room.connect === 'function',
          count: sharedState().count,
          peers: presence.all().length,
          status: status(),
        },
        null,
        2,
      )}
    </pre>
  );
}

export function App(): JSX.Element {
  return (
    <RoomfulProvider
      presence={{ color: '#0891b2', name: 'Solid Smoke' }}
      roomId="publish-smoke-solid"
    >
      <SmokePanel />
    </RoomfulProvider>
  );
}
