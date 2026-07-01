import type { RoomStatus } from '@roomful/core';
import { LiveIndicator, PresenceBar } from '@roomful/cursors';
import { useConnectionStatus, usePresence } from '@roomful/react';
import { type ReactElement, useEffect } from 'react';

import type { MiniAppDefinition } from '../apps/registry';
import type { DemoIdentity, DemoPresence } from '../demo-types';
import { AITeammate } from './ai-teammate';
import { SessionRecorder } from './session-recorder';

function statusLabel(status: RoomStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected live';
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Connection issue';
    default:
      return 'Starting room';
  }
}

interface MiniAppStageProps {
  app: MiniAppDefinition;
  identity: DemoIdentity;
  transportLabel: string;
  roomId: string;
  transport: 'broadcast' | 'websocket';
  relayUrl?: string | undefined;
}

export function MiniAppStage({
  app,
  identity,
  transportLabel,
  roomId,
  transport,
  relayUrl,
}: MiniAppStageProps): ReactElement {
  const { all, others, update } = usePresence<DemoPresence>();
  const status = useConnectionStatus<DemoPresence>();
  const AppComponent = app.Component;

  useEffect(() => {
    update({ color: identity.color, name: identity.name });
  }, [identity.color, identity.name, update]);

  return (
    <section className="stage">
      <header className="stage__head">
        <div className="stage__title">
          <h2>{app.title}</h2>
          <p>{app.tagline}</p>
        </div>
        <div className="stage__meta">
          <span className="stage__status" data-status={status}>
            <LiveIndicator
              ariaLabel="Room status"
              color={status === 'connected' ? '#5cc7ab' : '#fbbf24'}
              size={11}
            />
            {statusLabel(status)}
          </span>
          <span className="stage__badge">{app.primitives}</span>
        </div>
      </header>

      <div className="stage__presence">
        <PresenceBar<DemoPresence> maxVisible={8} showNames size="sm" />
        <span className="stage__hint">
          <span data-testid="presence-count-value" hidden>
            {all.length}
          </span>
          {others.length === 0
            ? transportLabel
            : `${String(others.length)} other ${others.length === 1 ? 'person' : 'people'} here`}
        </span>
        <AITeammate relayUrl={relayUrl} roomId={roomId} transport={transport} />
      </div>

      <div className="stage__app" data-app={app.id}>
        <AppComponent identity={identity} />
      </div>

      <SessionRecorder />
    </section>
  );
}
