import './styles.css';

import type {
  EventEngine,
  Peer,
  PresenceData,
  Room,
  StateEngine,
  Unsubscribe,
} from '@cahoots/core';
import { createRoom } from '@cahoots/core';

interface DashboardPresence extends PresenceData {
  name?: string;
}

interface DashboardState {
  errors: number;
  latencyMs: number;
  requests: number;
}

const initialState: DashboardState = {
  errors: 0,
  latencyMs: 0,
  requests: 0,
};

let room: Room<DashboardPresence> | null = null;
let state: StateEngine<DashboardState> | null = null;
let events: EventEngine<DashboardPresence> | null = null;
let subscriptions: Unsubscribe[] = [];
let dashboardState = initialState;

const roomInput = getElement('room-id', HTMLInputElement);
const nameInput = getElement('name', HTMLInputElement);
const connectButton = getElement('connect', HTMLButtonElement);
const statusText = getElement('status', HTMLElement);
const requestsValue = getElement('requests', HTMLElement);
const errorsValue = getElement('errors', HTMLElement);
const latencyValue = getElement('latency', HTMLElement);
const addRequestButton = getElement('add-request', HTMLButtonElement);
const addErrorButton = getElement('add-error', HTMLButtonElement);
const sampleLatencyButton = getElement('sample-latency', HTMLButtonElement);
const peerList = getElement('peers', HTMLOListElement);
const alertInput = getElement('alert-input', HTMLInputElement);
const sendAlertButton = getElement('send-alert', HTMLButtonElement);
const alertList = getElement('alerts', HTMLOListElement);

function getElement<TElement extends HTMLElement>(
  id: string,
  ElementConstructor: new () => TElement,
): TElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new TypeError(`Missing example element: #${id}.`);
  }

  if (!(element instanceof ElementConstructor)) {
    throw new TypeError(`Unexpected example element type: #${id}.`);
  }

  return element;
}

function setStatus(value: string): void {
  statusText.textContent = value;
}

function renderDashboard(nextState = dashboardState): void {
  dashboardState = nextState;
  requestsValue.textContent = String(nextState.requests);
  errorsValue.textContent = String(nextState.errors);
  latencyValue.textContent = `${nextState.latencyMs} ms`;
}

function renderPeers(peers: Peer<DashboardPresence>[]): void {
  peerList.replaceChildren();

  if (peers.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No peers connected.';
    peerList.append(empty);
    return;
  }

  for (const peer of peers) {
    const item = document.createElement('li');
    item.textContent = peer.name ?? peer.id;
    peerList.append(item);
  }
}

function appendAlert(message: string): void {
  const item = document.createElement('li');
  item.textContent = message;
  alertList.prepend(item);
}

async function disconnectRoom(): Promise<void> {
  const currentRoom = room;
  subscriptions.forEach((unsubscribe) => unsubscribe());
  subscriptions = [];
  room = null;
  state = null;
  events = null;

  if (currentRoom) {
    await currentRoom.disconnect();
  }
}

async function connectRoom(): Promise<void> {
  await disconnectRoom();

  const nextRoom = createRoom<DashboardPresence>(roomInput.value.trim() || 'live-dashboard-room', {
    presence: {
      name: nameInput.value.trim() || 'Dashboard peer',
    },
    transport: 'broadcast',
  });
  const presence = nextRoom.usePresence();
  const nextState = nextRoom.useState<DashboardState>({
    initialValue: initialState,
    strategy: 'lww',
  });
  const nextEvents = nextRoom.useEvents({ loopback: true });

  room = nextRoom;
  state = nextState;
  events = nextEvents;
  subscriptions = [
    presence.subscribe(renderPeers),
    nextState.subscribe(renderDashboard),
    nextEvents.on<{ message: string }>('dashboard:alert', (payload, from) => {
      appendAlert(`${from.name ?? from.id}: ${payload.message}`);
    }),
    nextRoom.on('connected', () => {
      setStatus(`connected as ${nextRoom.peerId}`);
      renderPeers(presence.getAll());
      renderDashboard(nextState.get());
    }),
    nextRoom.on('disconnected', () => {
      setStatus('disconnected');
      renderPeers([]);
    }),
    nextRoom.on('error', (error) => {
      setStatus(error.message);
    }),
  ];

  setStatus('connecting');
  await nextRoom.connect();
}

function updateDashboard(patch: Partial<DashboardState>): void {
  const nextState = {
    ...dashboardState,
    ...patch,
  };
  renderDashboard(nextState);
  state?.set(nextState);
}

connectButton.addEventListener('click', () => {
  void connectRoom();
});
addRequestButton.addEventListener('click', () => {
  updateDashboard({ requests: dashboardState.requests + 1 });
});
addErrorButton.addEventListener('click', () => {
  updateDashboard({ errors: dashboardState.errors + 1 });
});
sampleLatencyButton.addEventListener('click', () => {
  updateDashboard({ latencyMs: 80 + Math.floor(Math.random() * 220) });
});
sendAlertButton.addEventListener('click', () => {
  const message = alertInput.value.trim();
  if (message.length === 0) {
    return;
  }

  events?.emit('dashboard:alert', { message });
});

renderDashboard();
renderPeers([]);
