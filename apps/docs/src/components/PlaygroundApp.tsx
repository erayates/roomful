import '../styles/playground.css';

import type {
  EventEngine,
  Peer,
  PresenceData,
  Room,
  RoomStatus,
  StateChangeMeta,
  StateEngine,
  TransportMode,
  Unsubscribe,
} from '@cahoots/core';
import { createRoom } from '@cahoots/core';
import type { ReactElement } from 'react';
import { startTransition, useEffect, useRef, useState } from 'react';

type DemoPresence = PresenceData & {
  name?: string;
  color?: string;
  [key: string]: unknown;
};

interface SharedDocument {
  clicks: number;
  note: string;
}

interface FormState {
  roomId: string;
  name: string;
  color: string;
  relayUrl: string;
  transport: TransportMode;
}

interface LogEntry {
  id: number;
  message: string;
}

const defaultFormState: FormState = {
  roomId: 'cahoots-playground',
  name: 'Visitor',
  color: '#0f766e',
  relayUrl: 'ws://localhost:8787',
  transport: 'broadcast',
};

const defaultSharedDocument: SharedDocument = {
  clicks: 0,
  note: 'Open a second tab and connect to the same room to watch sync happen live.',
};

function getRuntimeWindow(): Window | null {
  return 'window' in globalThis ? globalThis.window : null;
}

function isTransportMode(value: string): value is TransportMode {
  return value === 'auto' || value === 'broadcast' || value === 'webrtc' || value === 'websocket';
}

function appendLog(entries: LogEntry[], message: string): LogEntry[] {
  return [...entries.slice(-11), { id: Date.now() + entries.length, message }];
}

function describeStateChange(meta: StateChangeMeta): string {
  return `Shared state ${meta.reason} by ${meta.changedBy}${meta.pending ? ' (pending)' : ''}.`;
}

function readInitialForm(): FormState {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return defaultFormState;
  }

  const params = new URLSearchParams(runtimeWindow.location.search);
  const transport = params.get('transport');

  return {
    roomId: params.get('roomId') ?? defaultFormState.roomId,
    name: params.get('name') ?? defaultFormState.name,
    color: params.get('color') ?? defaultFormState.color,
    relayUrl: params.get('relayUrl') ?? defaultFormState.relayUrl,
    transport:
      transport === 'auto' ||
      transport === 'webrtc' ||
      transport === 'websocket' ||
      transport === 'broadcast'
        ? transport
        : defaultFormState.transport,
  };
}

export function PlaygroundApp(): ReactElement {
  const [form, setForm] = useState<FormState>(readInitialForm);
  const [status, setStatus] = useState<RoomStatus>('idle');
  const [peers, setPeers] = useState<Peer<DemoPresence>[]>([]);
  const [sharedDocument, setSharedDocument] = useState<SharedDocument>(defaultSharedDocument);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTransport, setActiveTransport] = useState<string>('not connected');

  const roomRef = useRef<Room<DemoPresence> | null>(null);
  const stateRef = useRef<StateEngine<SharedDocument> | null>(null);
  const eventsRef = useRef<EventEngine<DemoPresence> | null>(null);
  const subscriptionsRef = useRef<Unsubscribe[]>([]);

  const pushLog = (message: string): void => {
    startTransition(() => {
      setLogs((current) => appendLog(current, message));
    });
  };

  const releaseRoom = async (silent: boolean): Promise<void> => {
    const currentRoom = roomRef.current;

    subscriptionsRef.current.forEach((unsubscribe) => {
      unsubscribe();
    });
    subscriptionsRef.current = [];

    stateRef.current = null;
    eventsRef.current = null;
    roomRef.current = null;

    if (!currentRoom) {
      if (!silent) {
        setStatus('idle');
      }
      return;
    }

    try {
      await currentRoom.disconnect();
    } catch (error) {
      pushLog(error instanceof Error ? error.message : 'Disconnect failed.');
    } finally {
      setStatus('disconnected');
      setPeers([]);
      setActiveTransport('not connected');
      if (!silent) {
        pushLog('Disconnected from the room.');
      }
    }
  };

  const connect = async (): Promise<void> => {
    await releaseRoom(true);

    const requiresRelay = form.transport === 'webrtc' || form.transport === 'websocket';
    const room = createRoom<DemoPresence>(form.roomId, {
      transport: form.transport,
      presence: {
        color: form.color,
        name: form.name,
      },
      ...(requiresRelay && form.relayUrl ? { relayUrl: form.relayUrl } : {}),
    });

    roomRef.current = room;

    const presence = room.usePresence();
    const sharedState = room.useState<SharedDocument>({
      initialValue: defaultSharedDocument,
      strategy: 'lww',
    });
    const events = room.useEvents({ loopback: true });

    stateRef.current = sharedState;
    eventsRef.current = events;

    subscriptionsRef.current = [
      presence.subscribe((nextPeers) => {
        setPeers(nextPeers);
      }),
      sharedState.subscribe((value, meta) => {
        setSharedDocument(value);
        pushLog(describeStateChange(meta));
      }),
      events.on<{ message: string }>('playground:log', (payload, from) => {
        const sender = from.name ?? from.id;
        pushLog(`${sender}: ${payload.message}`);
      }),
      room.on('connected', () => {
        setStatus('connected');
        setPeers(presence.getAll());
        setSharedDocument(sharedState.get());
        pushLog(`Connected to "${room.id}" as ${form.name}.`);
        void room.getDiagnostics().then((diagnostics) => {
          setActiveTransport(diagnostics.transport.current ?? 'unknown');
        });
      }),
      room.on('disconnected', ({ reason }) => {
        setStatus('disconnected');
        pushLog(reason ? `Disconnected: ${reason}.` : 'Disconnected.');
      }),
      room.on('peer:join', (peer) => {
        pushLog(`${peer.name ?? peer.id} joined the room.`);
      }),
      room.on('peer:leave', (peer) => {
        pushLog(`${peer.name ?? peer.id} left the room.`);
      }),
      room.on('error', (error) => {
        setStatus('error');
        pushLog(error.message);
      }),
    ];

    setStatus('connecting');
    pushLog(`Connecting with ${form.transport} transport.`);
    await room.connect();
  };

  const disconnect = async (): Promise<void> => {
    await releaseRoom(false);
  };

  const updateSharedNote = (value: string): void => {
    setSharedDocument((current) => ({ ...current, note: value }));
    stateRef.current?.patch({ note: value });
  };

  const incrementClicks = (): void => {
    const current = stateRef.current?.get() ?? sharedDocument;
    stateRef.current?.set({
      ...current,
      clicks: current.clicks + 1,
    });
  };

  const broadcastMessage = (): void => {
    eventsRef.current?.emit('playground:log', {
      message: `${form.name} says hello from docs.cahoots.dev.`,
    });
  };

  const openSecondTab = (): void => {
    const runtimeWindow = getRuntimeWindow();
    if (!runtimeWindow) {
      return;
    }

    runtimeWindow.open(runtimeWindow.location.href, '_blank', 'noopener,noreferrer');
  };

  const copyRoomLink = async (): Promise<void> => {
    const runtimeWindow = getRuntimeWindow();
    if (!runtimeWindow) {
      return;
    }

    const url = new URL(runtimeWindow.location.href);
    url.searchParams.set('roomId', form.roomId);
    url.searchParams.set('name', form.name);
    url.searchParams.set('color', form.color);
    url.searchParams.set('transport', form.transport);
    if (form.relayUrl) {
      url.searchParams.set('relayUrl', form.relayUrl);
    }

    try {
      await navigator.clipboard.writeText(url.toString());
      pushLog('Playground URL copied to the clipboard.');
    } catch {
      pushLog('Clipboard access was unavailable.');
    }
  };

  useEffect(() => {
    const runtimeWindow = getRuntimeWindow();
    if (!runtimeWindow) {
      return;
    }

    const url = new URL(runtimeWindow.location.href);
    url.searchParams.set('roomId', form.roomId);
    url.searchParams.set('name', form.name);
    url.searchParams.set('color', form.color);
    url.searchParams.set('transport', form.transport);
    if (form.relayUrl) {
      url.searchParams.set('relayUrl', form.relayUrl);
    } else {
      url.searchParams.delete('relayUrl');
    }
    runtimeWindow.history.replaceState(null, '', url);
  }, [form]);

  useEffect(() => {
    return () => {
      void releaseRoom(true);
    };
  }, []);

  return (
    <div className="playground-shell">
      <div className="playground-card">
        <p>
          Start with <code>broadcast</code> to sync state between tabs without a server. Switch to{' '}
          <code>webrtc</code> or <code>websocket</code> when you have a relay available.
        </p>
      </div>

      <div className="playground-grid">
        <section className="playground-card">
          <div className="playground-status" data-state={status}>
            Status: {status}
          </div>

          <form className="playground-form" onSubmit={(event) => event.preventDefault()}>
            <label className="playground-field">
              <span>Room ID</span>
              <input
                name="roomId"
                value={form.roomId}
                onChange={(event) => {
                  setForm((current) => ({ ...current, roomId: event.target.value }));
                }}
              />
            </label>

            <label className="playground-field">
              <span>Peer name</span>
              <input
                name="name"
                value={form.name}
                onChange={(event) => {
                  setForm((current) => ({ ...current, name: event.target.value }));
                }}
              />
            </label>

            <label className="playground-field">
              <span>Color</span>
              <input
                name="color"
                type="color"
                value={form.color}
                onChange={(event) => {
                  setForm((current) => ({ ...current, color: event.target.value }));
                }}
              />
            </label>

            <label className="playground-field">
              <span>Transport</span>
              <select
                value={form.transport}
                onChange={(event) => {
                  const nextTransport = event.target.value;
                  if (!isTransportMode(nextTransport)) {
                    return;
                  }

                  setForm((current) => ({
                    ...current,
                    transport: nextTransport,
                  }));
                }}
              >
                <option value="broadcast">broadcast</option>
                <option value="auto">auto</option>
                <option value="webrtc">webrtc</option>
                <option value="websocket">websocket</option>
              </select>
            </label>

            <label className="playground-field">
              <span>Relay URL</span>
              <input
                name="relayUrl"
                placeholder="ws://localhost:8787"
                value={form.relayUrl}
                onChange={(event) => {
                  setForm((current) => ({ ...current, relayUrl: event.target.value }));
                }}
              />
            </label>
          </form>

          <div className="playground-actions">
            <button
              className="playground-button playground-button--primary"
              onClick={() => void connect()}
            >
              Connect
            </button>
            <button className="playground-button" onClick={() => void disconnect()}>
              Disconnect
            </button>
            <button className="playground-button" onClick={openSecondTab}>
              Open second tab
            </button>
            <button className="playground-button" onClick={() => void copyRoomLink()}>
              Copy room link
            </button>
          </div>
        </section>

        <section className="playground-card">
          <h2>Shared document</h2>
          <label className="playground-field">
            <span>Shared note</span>
            <textarea
              className="playground-note"
              value={sharedDocument.note}
              onChange={(event) => {
                updateSharedNote(event.target.value);
              }}
            />
          </label>

          <div className="playground-actions">
            <button
              className="playground-button playground-button--primary"
              onClick={incrementClicks}
            >
              Increment shared counter
            </button>
            <button className="playground-button" onClick={broadcastMessage}>
              Broadcast hello
            </button>
          </div>

          <ul className="playground-kpi-list">
            <li>Transport in use: {activeTransport}</li>
            <li>Connected peers: {peers.length}</li>
            <li>Shared clicks: {sharedDocument.clicks}</li>
          </ul>
        </section>

        <section className="playground-card">
          <h2>Peers</h2>
          <ul className="playground-peer-list">
            {peers.map((peer) => (
              <li className="playground-peer" key={peer.id}>
                <span>{peer.name ?? peer.id}</span>
                <span>{peer.id === roomRef.current?.peerId ? 'You' : peer.id}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="playground-card">
          <h2>Event log</h2>
          <ul className="playground-log">
            {logs.map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
