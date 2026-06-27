import { RoomfulProvider } from '@roomful/react';
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';

import { findMiniApp, MINI_APPS } from './apps/registry';
import { resolveDemoRuntimeConfig } from './demo-config';
import { createDemoIdentity, readStoredIdentity, writeStoredIdentity } from './demo-identity';
import { createDemoRoomId, getOrCreateStoredRoomId, resolveDemoRoomSelection } from './demo-room';
import { createInviteUrl } from './demo-share';
import type { DemoIdentity, DemoPresence, DemoRuntimeConfig } from './demo-types';
import { MiniAppStage } from './shell/mini-app-stage';
import { TopBar } from './shell/top-bar';

function readInitialIdentity(): DemoIdentity {
  try {
    return readStoredIdentity(window.localStorage) ?? createDemoIdentity();
  } catch {
    return createDemoIdentity();
  }
}

function readInitialRoomId(): string {
  try {
    return getOrCreateStoredRoomId(window.localStorage);
  } catch {
    return createDemoRoomId();
  }
}

function readActiveAppId(): string {
  return findMiniApp(new URLSearchParams(window.location.search).get('app')).id;
}

export function App(): ReactElement {
  const [identity, setIdentity] = useState<DemoIdentity>(() => readInitialIdentity());
  const [providerPresence] = useState<DemoPresence>(() => ({ ...identity }));
  const [config] = useState<DemoRuntimeConfig>(() => resolveDemoRuntimeConfig(window.location));
  const [roomError, setRoomError] = useState<string | null>(null);
  const [activeAppId, setActiveAppId] = useState<string>(() => readActiveAppId());
  const [roomId] = useState(() => readInitialRoomId());
  const roomSelection = useMemo(
    () =>
      resolveDemoRoomSelection(
        { dayOverride: config.dayOverride, roomOverride: config.roomOverride },
        roomId,
      ),
    [config.dayOverride, config.roomOverride, roomId],
  );

  useEffect(() => {
    try {
      writeStoredIdentity(window.localStorage, identity);
    } catch {
      return undefined;
    }

    return undefined;
  }, [identity]);

  const selectApp = useCallback((id: string): void => {
    setActiveAppId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('app', id);
    window.history.replaceState(null, '', url);
  }, []);

  const activeApp = findMiniApp(activeAppId);
  const appRoomId = `${roomSelection.roomId}-${activeApp.id}`;
  const shareUrl = createInviteUrl(
    config.canonicalBaseUrl,
    activeApp.id,
    roomSelection.roomId,
    config.relayUrl,
  );

  return (
    <div className="playground">
      <span aria-hidden="true" className="demo-page__glow demo-page__glow--left" />
      <span aria-hidden="true" className="demo-page__glow demo-page__glow--right" />

      {roomError ? (
        <div className="demo-error" role="alert">
          <span>Connection issue — {roomError}</span>
          <button
            onClick={() => {
              setRoomError(null);
            }}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <TopBar
        activeAppId={activeApp.id}
        apps={MINI_APPS}
        identity={identity}
        onIdentityChange={setIdentity}
        onSelectApp={selectApp}
        shareUrl={shareUrl}
      />

      <main className="playground__main">
        <RoomfulProvider<DemoPresence>
          key={appRoomId}
          onError={(error) => {
            setRoomError(error.message);
          }}
          presence={providerPresence}
          reconnect={{
            backoffMs: 500,
            backoffMultiplier: 1.6,
            maxAttempts: 8,
            maxBackoffMs: 4_000,
          }}
          roomId={appRoomId}
          transport={config.transport}
          websocket={{ fallbackTransport: 'polling' }}
          {...(config.relayUrl ? { relayUrl: config.relayUrl } : {})}
        >
          <MiniAppStage
            app={activeApp}
            identity={identity}
            transportLabel={config.transportLabel}
          />
        </RoomfulProvider>
      </main>
    </div>
  );
}
