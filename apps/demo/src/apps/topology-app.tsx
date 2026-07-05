import { useConnectionStatus, usePresence, useRoom } from '@roomful/react';
import { type ReactElement, useEffect, useState } from 'react';

import type { DemoPresence } from '../demo-types';

interface TopologyInfo {
  latency: Record<string, number>;
  transport: string | null;
}

const CENTER = { x: 160, y: 130 };
const RADIUS = 92;

/**
 * A live network-topology visualizer: the local peer sits at the center, remote peers orbit it, and
 * each edge is labeled with the measured round-trip latency. It polls `room.getDiagnostics()` for
 * latency and the active transport, so it shows the real connection state of the room.
 */
export function TopologyApp(): ReactElement {
  const { others } = usePresence<DemoPresence>();
  const status = useConnectionStatus<DemoPresence>();
  const room = useRoom<DemoPresence>();
  const [info, setInfo] = useState<TopologyInfo>({ latency: {}, transport: null });

  useEffect(() => {
    let active = true;
    const poll = async (): Promise<void> => {
      const diagnostics = await room.getDiagnostics();
      if (active) {
        setInfo({ latency: diagnostics.network.latency, transport: diagnostics.transport.current });
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [room]);

  const peerNodes = others.map((peer, index) => {
    const angle = ((-90 + (360 / Math.max(others.length, 1)) * index) * Math.PI) / 180;
    return {
      peer,
      x: CENTER.x + RADIUS * Math.cos(angle),
      y: CENTER.y + RADIUS * Math.sin(angle),
      latency: info.latency[peer.id],
    };
  });

  return (
    <div className="topology-app">
      <svg
        aria-label="Network topology"
        className="topology-graph"
        role="img"
        viewBox="0 0 320 260"
      >
        {peerNodes.map(({ peer, x, y, latency }) => (
          <g key={peer.id}>
            <line className="topology-edge" x1={CENTER.x} x2={x} y1={CENTER.y} y2={y} />
            <text className="topology-latency" x={(CENTER.x + x) / 2} y={(CENTER.y + y) / 2 - 5}>
              {typeof latency === 'number' ? `${String(Math.round(latency))}ms` : '…'}
            </text>
            <circle className="topology-node" cx={x} cy={y} fill={peer.color ?? '#5cc7ab'} r={15} />
            <text className="topology-label" x={x} y={y + 30}>
              {peer.name ?? 'Peer'}
            </text>
          </g>
        ))}
        <circle className="topology-self" cx={CENTER.x} cy={CENTER.y} r={20} />
        <text className="topology-self-label" x={CENTER.x} y={CENTER.y + 4}>
          You
        </text>
      </svg>
      <div className="topology-meta">
        <span className="topology-badge" data-status={status}>
          {status === 'connected' ? 'Connected' : status} · {info.transport ?? '—'}
        </span>
        <span className="topology-hint" data-testid="topology-peers">
          {others.length === 0
            ? 'Add the AI teammate or open a second tab to populate the topology.'
            : `${String(others.length)} peer${others.length === 1 ? '' : 's'} · latency measured live`}
        </span>
      </div>
    </div>
  );
}
