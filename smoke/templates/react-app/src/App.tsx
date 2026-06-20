import {
  FlockProvider,
  useAwareness,
  useConnectionStatus,
  usePresence,
  useRoom,
  useSharedState,
} from '@flockjs/react';
import type { ReactElement } from 'react';

type SmokePresence = {
  color: string;
  name: string;
};

function SmokePanel(): ReactElement {
  const room = useRoom<SmokePresence>();
  const presence = usePresence<SmokePresence>();
  const awareness = useAwareness();
  const status = useConnectionStatus();
  const [sharedState] = useSharedState('react-smoke-state', {
    initialValue: { count: 1 },
    strategy: 'lww',
  });

  return (
    <pre>
      {JSON.stringify(
        {
          awareness: awareness.others.length,
          canConnect: typeof room.connect === 'function',
          count: sharedState.count,
          peers: presence.all.length,
          status,
        },
        null,
        2,
      )}
    </pre>
  );
}

export function App(): ReactElement {
  return (
    <FlockProvider
      presence={{ color: '#4f46e5', name: 'React Smoke' }}
      roomId="publish-smoke-react"
    >
      <SmokePanel />
    </FlockProvider>
  );
}
