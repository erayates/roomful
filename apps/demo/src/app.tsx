import { CahootsProvider } from '@cahoots/react';
import { type ReactElement, useEffect, useState } from 'react';

import { resolveDemoRuntimeConfig } from './demo-config';
import { DemoExperience } from './demo-experience';
import { createDemoIdentity, readStoredIdentity, writeStoredIdentity } from './demo-identity';
import { getMillisecondsUntilNextUtcMidnight, resolveDemoRoomSelection } from './demo-room';
import type { DemoIdentity, DemoPresence, DemoRuntimeConfig } from './demo-types';

function readInitialIdentity(): DemoIdentity {
  try {
    return readStoredIdentity(window.localStorage) ?? createDemoIdentity();
  } catch {
    return createDemoIdentity();
  }
}

function readInitialPresence(): DemoPresence {
  return {
    ...readInitialIdentity(),
  };
}

function readInitialConfig(): DemoRuntimeConfig {
  return resolveDemoRuntimeConfig(window.location);
}

function resolveRoomLabel(roomKey: string, roomOverride?: string): string {
  return roomOverride ?? `${roomKey} UTC`;
}

export function App(): ReactElement {
  const [providerPresence] = useState<DemoPresence>(() => readInitialPresence());
  const [identity, setIdentity] = useState<DemoIdentity>(() => ({
    color: providerPresence.color,
    name: providerPresence.name,
  }));
  const [runtimeConfig] = useState<DemoRuntimeConfig>(() => readInitialConfig());
  const [roomSelection, setRoomSelection] = useState(() =>
    resolveDemoRoomSelection(
      {
        dayOverride: runtimeConfig.dayOverride,
        roomOverride: runtimeConfig.roomOverride,
      },
      new Date(),
    ),
  );

  useEffect(() => {
    try {
      writeStoredIdentity(window.localStorage, identity);
    } catch {
      return undefined;
    }

    return undefined;
  }, [identity]);

  useEffect(() => {
    if (runtimeConfig.dayOverride || runtimeConfig.roomOverride) {
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => {
        setRoomSelection(resolveDemoRoomSelection({}, new Date()));
      },
      getMillisecondsUntilNextUtcMidnight(new Date()) + 100,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [roomSelection.roomId, runtimeConfig.dayOverride, runtimeConfig.roomOverride]);

  return (
    <CahootsProvider<DemoPresence>
      key={roomSelection.roomId}
      presence={providerPresence}
      reconnect={{ backoffMs: 500, backoffMultiplier: 1.6, maxAttempts: 8, maxBackoffMs: 4_000 }}
      relayUrl={runtimeConfig.relayUrl}
      roomId={roomSelection.roomId}
      transport="websocket"
      websocket={{ fallbackTransport: 'polling' }}
    >
      <DemoExperience
        canonicalBaseUrl={runtimeConfig.canonicalBaseUrl}
        identity={identity}
        onIdentityChange={setIdentity}
        roomLabel={resolveRoomLabel(roomSelection.roomKey, runtimeConfig.roomOverride)}
      />
    </CahootsProvider>
  );
}
