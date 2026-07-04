import type { ActivityEntry, AgentProposal, AgentState, RoomStatus } from '@roomful/core';
import { AGENT_ACTION_PREFIX, getAgentActions, getAgentState, isAgentPeer } from '@roomful/core';
import { LiveIndicator, PresenceBar } from '@roomful/cursors';
import {
  useActivity,
  useAgentApprovals,
  useConnectionStatus,
  usePresence,
  useSessionSummarizer,
} from '@roomful/react';
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

function agentStateLabel(state: AgentState | null): string {
  switch (state) {
    case 'thinking':
      return 'thinking…';
    case 'typing':
      return 'typing…';
    case 'editing':
      return 'editing…';
    case 'waiting-approval':
      return 'waiting for approval';
    default:
      return 'idle';
  }
}

function actionLabel(entry: ActivityEntry): string {
  return entry.type.startsWith(AGENT_ACTION_PREFIX)
    ? entry.type.slice(AGENT_ACTION_PREFIX.length)
    : entry.type;
}

function proposalLabel(proposal: AgentProposal): string {
  const payload = proposal.payload;
  if (payload !== null && typeof payload === 'object' && 'emoji' in payload) {
    return `${proposal.type} ${String(payload.emoji)}`;
  }
  return proposal.type;
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
  const { entries } = useActivity<DemoPresence>();
  const { pending, approve, reject } = useAgentApprovals<DemoPresence>();
  const summary = useSessionSummarizer<DemoPresence>();
  const AppComponent = app.Component;

  // Surface the AI teammate's live state (thinking/typing/editing…) straight from presence.
  const agentPeer = all.find((peer) => isAgentPeer(peer));
  const agentState = agentPeer ? getAgentState(agentPeer) : null;
  // The agent's structured, auditable action log (newest first).
  const agentActions = getAgentActions(entries);
  const lastAction = agentActions[0];

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
        {agentPeer ? (
          <span className="stage__badge" data-agent-state={agentState ?? 'idle'}>
            🤖 {agentPeer.name ?? 'AI'} · {agentStateLabel(agentState)}
          </span>
        ) : null}
        {lastAction ? (
          <span className="stage__hint" data-testid="agent-action-log">
            {agentActions.length} agent {agentActions.length === 1 ? 'action' : 'actions'} · last:{' '}
            {actionLabel(lastAction)}
          </span>
        ) : null}
        {summary.eventCount > 0 ? (
          <span className="stage__hint" data-testid="session-summary">
            📋 {summary.text}
          </span>
        ) : null}
      </div>

      {pending.length > 0 ? (
        <div className="stage__approvals" data-testid="agent-approvals">
          {pending.map((proposal) => (
            <div className="stage__approval" key={proposal.id}>
              <span className="stage__approval-label">
                🤖 {proposal.proposer.name ?? 'AI'} proposes: {proposalLabel(proposal)}
              </span>
              <button
                className="button button--sm button--primary"
                onClick={() => {
                  approve(proposal.id);
                }}
                type="button"
              >
                Approve
              </button>
              <button
                className="button button--sm button--ghost"
                onClick={() => {
                  reject(proposal.id);
                }}
                type="button"
              >
                Reject
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="stage__app" data-app={app.id}>
        <AppComponent identity={identity} />
      </div>

      <SessionRecorder />
    </section>
  );
}
