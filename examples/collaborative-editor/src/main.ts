import './styles.css';

import type { AwarenessState, Peer, PresenceData, Room, Unsubscribe } from '@flockjs/core';
import { createRoom } from '@flockjs/core';

interface EditorPresence extends PresenceData {
  color?: string;
  name?: string;
}

let room: Room<EditorPresence> | null = null;
let subscriptions: Unsubscribe[] = [];
let awarenessTypingTimer: number | null = null;
let applyingRemoteText = false;

const roomInput = getElement('room-id', HTMLInputElement);
const nameInput = getElement('name', HTMLInputElement);
const colorInput = getElement('color', HTMLInputElement);
const connectButton = getElement('connect', HTMLButtonElement);
const statusText = getElement('status', HTMLElement);
const editor = getElement('editor', HTMLTextAreaElement);
const peerList = getElement('peers', HTMLUListElement);
const awarenessList = getElement('awareness', HTMLUListElement);

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

function renderPeers(peers: Peer<EditorPresence>[]): void {
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
    item.style.borderColor = typeof peer.color === 'string' ? peer.color : '#ccd6f2';
    peerList.append(item);
  }
}

function renderAwareness(states: AwarenessState[]): void {
  awarenessList.replaceChildren();

  if (states.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No awareness state yet.';
    awarenessList.append(empty);
    return;
  }

  for (const state of states) {
    const item = document.createElement('li');
    const name = typeof state.name === 'string' ? state.name : state.peerId;
    const typing = state.typing === true ? 'typing' : 'idle';
    const focused = state.focused === true ? 'focused' : 'blurred';
    item.textContent = `${name}: ${typing}, ${focused}`;
    awarenessList.append(item);
  }
}

async function disconnectRoom(): Promise<void> {
  const currentRoom = room;
  subscriptions.forEach((unsubscribe) => unsubscribe());
  subscriptions = [];
  room = null;

  if (currentRoom) {
    await currentRoom.disconnect();
  }
}

async function connectRoom(): Promise<void> {
  await disconnectRoom();

  const nextRoom = createRoom<EditorPresence>(
    roomInput.value.trim() || 'collaborative-editor-room',
    {
      presence: {
        color: colorInput.value,
        name: nameInput.value.trim() || 'Editor peer',
      },
      transport: 'broadcast',
    },
  );
  const presence = nextRoom.usePresence();
  const awareness = nextRoom.useAwareness();
  const text = nextRoom.getYDoc().getText('document');

  const syncFromText = (): void => {
    const nextValue = text.toJSON();
    if (editor.value === nextValue) {
      return;
    }

    applyingRemoteText = true;
    editor.value = nextValue;
    applyingRemoteText = false;
  };

  text.observe(syncFromText);
  room = nextRoom;
  subscriptions = [
    () => {
      text.unobserve(syncFromText);
    },
    presence.subscribe(renderPeers),
    awareness.subscribe(renderAwareness),
    nextRoom.getYProvider().on('sync', ({ synced }) => {
      setStatus(synced ? `synced as ${nextRoom.peerId}` : 'syncing');
      syncFromText();
    }),
    nextRoom.on('connected', () => {
      setStatus(`connected as ${nextRoom.peerId}`);
      renderPeers(presence.getAll());
      renderAwareness(awareness.getAll());
      syncFromText();
    }),
    nextRoom.on('disconnected', () => {
      setStatus('disconnected');
      renderPeers([]);
      renderAwareness([]);
    }),
    nextRoom.on('error', (error) => {
      setStatus(error.message);
    }),
  ];

  setStatus('connecting');
  await nextRoom.connect();
}

function replaceSharedText(value: string): void {
  if (!room || applyingRemoteText) {
    return;
  }

  const text = room.getYDoc().getText('document');
  room.getYDoc().transact(() => {
    text.delete(0, text.length);
    text.insert(0, value);
  });
}

function setTyping(value: boolean): void {
  const currentRoom = room;
  if (!currentRoom) {
    return;
  }

  currentRoom.useAwareness().set({
    focused: document.activeElement === editor,
    typing: value,
  });
}

connectButton.addEventListener('click', () => {
  void connectRoom();
});
editor.addEventListener('input', () => {
  replaceSharedText(editor.value);
  setTyping(true);

  if (awarenessTypingTimer !== null) {
    window.clearTimeout(awarenessTypingTimer);
  }

  awarenessTypingTimer = window.setTimeout(() => {
    setTyping(false);
  }, 900);
});
editor.addEventListener('focus', () => {
  setTyping(false);
});
editor.addEventListener('blur', () => {
  setTyping(false);
});

renderPeers([]);
renderAwareness([]);
