import './styles.css';

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
} from '@roomful/core';
import { createRoom } from '@roomful/core';

interface PlaygroundPresence extends PresenceData {
  color?: string;
  name?: string;
}

interface PlaygroundDocument {
  clicks: number;
  lastUpdatedBy: string | null;
  note: string;
}

interface PlaygroundFormState {
  color: string;
  name: string;
  relayUrl: string;
  roomId: string;
  transport: TransportMode;
}

interface LogEntry {
  id: number;
  message: string;
}

const defaultFormState: PlaygroundFormState = {
  color: '#007f68',
  name: 'Visitor',
  relayUrl: 'ws://localhost:8787',
  roomId: 'roomful-playground',
  transport: 'broadcast',
};

const defaultDocument: PlaygroundDocument = {
  clicks: 0,
  lastUpdatedBy: null,
  note: 'Open a second tab, connect to this room, and edit this note from either side.',
};

const maxLogEntries = 12;

let formState = readFormState();
let status: RoomStatus = 'idle';
let activeTransport = 'not connected';
let peers: Peer<PlaygroundPresence>[] = [];
let documentState: PlaygroundDocument = { ...defaultDocument };
let logEntries: LogEntry[] = [];
let room: Room<PlaygroundPresence> | null = null;
let sharedState: StateEngine<PlaygroundDocument> | null = null;
let events: EventEngine<PlaygroundPresence> | null = null;
let subscriptions: Unsubscribe[] = [];

const roomIdInput = getElement('room-id-input', HTMLInputElement);
const nameInput = getElement('name-input', HTMLInputElement);
const colorInput = getElement('color-input', HTMLInputElement);
const transportInput = getElement('transport-input', HTMLSelectElement);
const relayUrlInput = getElement('relay-url-input', HTMLInputElement);
const noteInput = getElement('note-input', HTMLTextAreaElement);
const statusValue = getElement('status-value', HTMLElement);
const statusPill = getElement('status-pill', HTMLElement);
const transportValue = getElement('transport-value', HTMLElement);
const peerCountValue = getElement('peer-count-value', HTMLElement);
const clickCountValue = getElement('click-count-value', HTMLElement);
const peerList = getElement('peer-list', HTMLUListElement);
const eventLog = getElement('event-log', HTMLOListElement);
const connectButton = getElement('connect-button', HTMLButtonElement);
const disconnectButton = getElement('disconnect-button', HTMLButtonElement);
const copyLinkButton = getElement('copy-link-button', HTMLButtonElement);
const secondTabButton = getElement('second-tab-button', HTMLButtonElement);
const incrementButton = getElement('increment-button', HTMLButtonElement);
const broadcastButton = getElement('broadcast-button', HTMLButtonElement);
const playgroundForm = getElement('playground-form', HTMLFormElement);

function getElement<TElement extends HTMLElement>(
  id: string,
  ElementConstructor: new () => TElement,
): TElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new TypeError(`Missing playground element: #${id}.`);
  }

  if (!(element instanceof ElementConstructor)) {
    throw new TypeError(`Unexpected playground element type: #${id}.`);
  }

  return element;
}

function isTransportMode(value: string): value is TransportMode {
  return value === 'auto' || value === 'broadcast' || value === 'webrtc' || value === 'websocket';
}

function readFormState(): PlaygroundFormState {
  const params = new URLSearchParams(window.location.search);
  const transport = params.get('transport') ?? defaultFormState.transport;

  return {
    color: params.get('color') ?? defaultFormState.color,
    name: params.get('name') ?? defaultFormState.name,
    relayUrl: params.get('relayUrl') ?? defaultFormState.relayUrl,
    roomId: params.get('roomId') ?? defaultFormState.roomId,
    transport: isTransportMode(transport) ? transport : defaultFormState.transport,
  };
}

function createShareUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set('roomId', formState.roomId);
  url.searchParams.set('name', formState.name);
  url.searchParams.set('color', formState.color);
  url.searchParams.set('transport', formState.transport);

  if (formState.relayUrl.length > 0) {
    url.searchParams.set('relayUrl', formState.relayUrl);
  } else {
    url.searchParams.delete('relayUrl');
  }

  return url.toString();
}

function updateUrlState(): void {
  window.history.replaceState(null, '', createShareUrl());
}

function describeStateChange(meta: StateChangeMeta): string {
  const pending = meta.pending ? ' while offline' : '';
  return `Shared document ${meta.reason}${pending} by ${meta.changedBy}.`;
}

function appendLog(message: string): void {
  logEntries = [...logEntries.slice(1 - maxLogEntries), { id: Date.now(), message }];
  renderLog();
}

function renderForm(): void {
  roomIdInput.value = formState.roomId;
  nameInput.value = formState.name;
  colorInput.value = formState.color;
  transportInput.value = formState.transport;
  relayUrlInput.value = formState.relayUrl;
}

function renderStatus(): void {
  statusValue.textContent = status;
  statusPill.textContent = status;
  statusPill.dataset.state = status;
  transportValue.textContent = activeTransport;
  peerCountValue.textContent = String(peers.length);

  connectButton.disabled = status === 'connecting';
  disconnectButton.disabled = room === null;
}

function renderDocument(): void {
  if (document.activeElement !== noteInput) {
    noteInput.value = documentState.note;
  }

  clickCountValue.textContent = `${documentState.clicks} click${
    documentState.clicks === 1 ? '' : 's'
  }`;
}

function renderPeers(): void {
  peerList.replaceChildren();

  if (peers.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'peer-list__empty';
    empty.textContent = 'No peers connected yet.';
    peerList.append(empty);
    return;
  }

  for (const peer of peers) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    const name = document.createElement('span');
    const id = document.createElement('span');

    item.className = 'peer';
    swatch.className = 'peer__swatch';
    swatch.style.backgroundColor = typeof peer.color === 'string' ? peer.color : '#007f68';
    name.textContent = peer.name ?? peer.id;
    id.textContent = peer.id === room?.peerId ? 'You' : peer.id;

    item.append(swatch, name, id);
    peerList.append(item);
  }
}

function renderLog(): void {
  eventLog.replaceChildren();

  for (const entry of logEntries.slice().reverse()) {
    const item = document.createElement('li');
    item.textContent = entry.message;
    eventLog.append(item);
  }
}

function renderAll(): void {
  renderForm();
  renderStatus();
  renderDocument();
  renderPeers();
  renderLog();
}

function updateForm(patch: Partial<PlaygroundFormState>): void {
  formState = {
    ...formState,
    ...patch,
  };
  updateUrlState();
}

function registerRoomSubscriptions(nextRoom: Room<PlaygroundPresence>): void {
  const presence = nextRoom.usePresence();
  const nextState = nextRoom.useState<PlaygroundDocument>({
    initialValue: defaultDocument,
    strategy: 'lww',
  });
  const nextEvents = nextRoom.useEvents({ loopback: true });

  sharedState = nextState;
  events = nextEvents;

  subscriptions = [
    presence.subscribe((nextPeers) => {
      peers = nextPeers;
      renderStatus();
      renderPeers();
    }),
    nextState.subscribe((value, meta) => {
      documentState = value;
      renderDocument();
      appendLog(describeStateChange(meta));
    }),
    nextEvents.on<{ message: string }>('playground:hello', (payload, from) => {
      appendLog(`${from.name ?? from.id}: ${payload.message}`);
    }),
    nextRoom.on('connected', () => {
      status = 'connected';
      peers = presence.getAll();
      documentState = nextState.get();
      void nextRoom.getDiagnostics().then((diagnostics) => {
        activeTransport = diagnostics.transport.current ?? formState.transport;
        renderStatus();
      });
      appendLog(`Connected to ${nextRoom.id}.`);
      renderAll();
    }),
    nextRoom.on('disconnected', ({ reason }) => {
      status = 'disconnected';
      activeTransport = 'not connected';
      peers = [];
      appendLog(reason ? `Disconnected: ${reason}.` : 'Disconnected.');
      renderAll();
    }),
    nextRoom.on('peer:join', (peer) => {
      appendLog(`${peer.name ?? peer.id} joined.`);
    }),
    nextRoom.on('peer:leave', (peer) => {
      appendLog(`${peer.name ?? peer.id} left.`);
    }),
    nextRoom.on('error', (error) => {
      status = 'error';
      appendLog(error.message);
      renderStatus();
    }),
  ];
}

async function releaseRoom(silent = false): Promise<void> {
  const currentRoom = room;

  for (const unsubscribe of subscriptions) {
    unsubscribe();
  }

  subscriptions = [];
  room = null;
  sharedState = null;
  events = null;

  if (!currentRoom) {
    return;
  }

  try {
    await currentRoom.disconnect();
  } catch (error) {
    appendLog(error instanceof Error ? error.message : 'Disconnect failed.');
  }

  status = 'disconnected';
  activeTransport = 'not connected';
  peers = [];
  if (!silent) {
    appendLog('Disconnected from the room.');
  }
  renderAll();
}

async function connectRoom(): Promise<void> {
  await releaseRoom(true);

  const requiresRelay = formState.transport === 'webrtc' || formState.transport === 'websocket';
  const nextRoom = createRoom<PlaygroundPresence>(formState.roomId, {
    transport: formState.transport,
    presence: {
      color: formState.color,
      name: formState.name,
    },
    ...(requiresRelay && formState.relayUrl.length > 0 ? { relayUrl: formState.relayUrl } : {}),
  });

  room = nextRoom;
  registerRoomSubscriptions(nextRoom);
  status = 'connecting';
  activeTransport = formState.transport;
  appendLog(`Connecting with ${formState.transport}.`);
  renderStatus();

  try {
    await nextRoom.connect();
  } catch (error) {
    status = 'error';
    appendLog(error instanceof Error ? error.message : 'Connection failed.');
    renderStatus();
  }
}

function updateSharedNote(value: string): void {
  documentState = {
    ...documentState,
    lastUpdatedBy: room?.peerId ?? null,
    note: value,
  };
  renderDocument();
  sharedState?.patch({
    lastUpdatedBy: room?.peerId ?? null,
    note: value,
  });
}

function incrementCounter(): void {
  const current = sharedState?.get() ?? documentState;
  const nextDocument = {
    ...current,
    clicks: current.clicks + 1,
    lastUpdatedBy: room?.peerId ?? null,
  };
  documentState = nextDocument;
  renderDocument();
  sharedState?.set(nextDocument);
}

function broadcastHello(): void {
  if (!events) {
    appendLog('Connect to a room before broadcasting.');
    return;
  }

  events.emit('playground:hello', {
    message: `Hello from ${formState.name}.`,
  });
}

async function copyShareLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(createShareUrl());
    appendLog('Room link copied.');
  } catch {
    appendLog('Clipboard access is unavailable.');
  }
}

function openSecondTab(): void {
  window.open(createShareUrl(), '_blank', 'noopener,noreferrer');
}

playgroundForm.addEventListener('submit', (event) => {
  event.preventDefault();
});
roomIdInput.addEventListener('input', () => {
  updateForm({ roomId: roomIdInput.value.trim() || defaultFormState.roomId });
});
nameInput.addEventListener('input', () => {
  updateForm({ name: nameInput.value.trim() || defaultFormState.name });
});
colorInput.addEventListener('input', () => {
  updateForm({ color: colorInput.value });
});
transportInput.addEventListener('change', () => {
  if (isTransportMode(transportInput.value)) {
    updateForm({ transport: transportInput.value });
  }
});
relayUrlInput.addEventListener('input', () => {
  updateForm({ relayUrl: relayUrlInput.value.trim() });
});
noteInput.addEventListener('input', () => {
  updateSharedNote(noteInput.value);
});
connectButton.addEventListener('click', () => {
  void connectRoom();
});
disconnectButton.addEventListener('click', () => {
  void releaseRoom();
});
copyLinkButton.addEventListener('click', () => {
  void copyShareLink();
});
secondTabButton.addEventListener('click', openSecondTab);
incrementButton.addEventListener('click', incrementCounter);
broadcastButton.addEventListener('click', broadcastHello);
window.addEventListener('beforeunload', () => {
  void releaseRoom(true);
});

updateUrlState();
renderAll();
