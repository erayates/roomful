import './styles.css';

import type { PresenceData, Room, StateEngine, Unsubscribe } from '@cahoots/core';
import { createRoom } from '@cahoots/core';

interface GamePresence extends PresenceData {
  color?: string;
  name?: string;
}

interface PlayerState {
  color: string;
  name: string;
  x: number;
  y: number;
}

interface GameState {
  players: Record<string, PlayerState>;
}

const initialState: GameState = {
  players: {},
};

let room: Room<GamePresence> | null = null;
let state: StateEngine<GameState> | null = null;
let subscriptions: Unsubscribe[] = [];
let gameState = initialState;

const roomInput = getElement('room-id', HTMLInputElement);
const nameInput = getElement('name', HTMLInputElement);
const colorInput = getElement('color', HTMLInputElement);
const connectButton = getElement('connect', HTMLButtonElement);
const disconnectButton = getElement('disconnect', HTMLButtonElement);
const statusText = getElement('status', HTMLElement);
const board = getElement('board', HTMLElement);
const upButton = getElement('up', HTMLButtonElement);
const leftButton = getElement('left', HTMLButtonElement);
const rightButton = getElement('right', HTMLButtonElement);
const downButton = getElement('down', HTMLButtonElement);

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

function clampCoordinate(value: number): number {
  return Math.min(92, Math.max(8, value));
}

function renderBoard(): void {
  board.replaceChildren();

  for (const [peerId, player] of Object.entries(gameState.players)) {
    const marker = document.createElement('div');
    marker.className = 'player';
    marker.style.backgroundColor = player.color;
    marker.style.left = `${player.x}%`;
    marker.style.top = `${player.y}%`;
    marker.textContent = player.name.slice(0, 2).toUpperCase();
    marker.title = `${player.name} (${peerId})`;
    board.append(marker);
  }
}

function publishGameState(nextState: GameState): void {
  gameState = nextState;
  renderBoard();
  state?.set(nextState);
}

function ensureLocalPlayer(): void {
  const currentRoom = room;
  if (!currentRoom) {
    return;
  }

  publishGameState({
    players: {
      ...gameState.players,
      [currentRoom.peerId]: {
        color: colorInput.value,
        name: nameInput.value.trim() || 'Player',
        x: 50,
        y: 50,
      },
    },
  });
}

function removeLocalPlayer(): void {
  const currentRoom = room;
  if (!currentRoom) {
    return;
  }

  const remainingPlayers = { ...gameState.players };
  delete remainingPlayers[currentRoom.peerId];
  publishGameState({ players: remainingPlayers });
}

async function disconnectRoom(): Promise<void> {
  removeLocalPlayer();

  const currentRoom = room;
  subscriptions.forEach((unsubscribe) => unsubscribe());
  subscriptions = [];
  room = null;
  state = null;

  if (currentRoom) {
    await currentRoom.disconnect();
  }

  setStatus('disconnected');
}

async function connectRoom(): Promise<void> {
  await disconnectRoom();

  const nextRoom = createRoom<GamePresence>(roomInput.value.trim() || 'multiplayer-game-room', {
    presence: {
      color: colorInput.value,
      name: nameInput.value.trim() || 'Player',
    },
    transport: 'broadcast',
  });
  const nextState = nextRoom.useState<GameState>({
    initialValue: initialState,
    strategy: 'crdt',
  });

  room = nextRoom;
  state = nextState;
  subscriptions = [
    nextState.subscribe((value) => {
      gameState = value;
      renderBoard();
    }),
    nextRoom.on('connected', () => {
      setStatus(`connected as ${nextRoom.peerId}`);
      gameState = nextState.get();
      ensureLocalPlayer();
    }),
    nextRoom.on('disconnected', () => {
      setStatus('disconnected');
    }),
    nextRoom.on('error', (error) => {
      setStatus(error.message);
    }),
  ];

  setStatus('connecting');
  await nextRoom.connect();
}

function moveLocalPlayer(deltaX: number, deltaY: number): void {
  const currentRoom = room;
  const currentPlayer = currentRoom ? gameState.players[currentRoom.peerId] : undefined;
  if (!currentRoom || !currentPlayer) {
    return;
  }

  publishGameState({
    players: {
      ...gameState.players,
      [currentRoom.peerId]: {
        ...currentPlayer,
        x: clampCoordinate(currentPlayer.x + deltaX),
        y: clampCoordinate(currentPlayer.y + deltaY),
      },
    },
  });
}

connectButton.addEventListener('click', () => {
  void connectRoom();
});
disconnectButton.addEventListener('click', () => {
  void disconnectRoom();
});
upButton.addEventListener('click', () => {
  moveLocalPlayer(0, -8);
});
leftButton.addEventListener('click', () => {
  moveLocalPlayer(-8, 0);
});
rightButton.addEventListener('click', () => {
  moveLocalPlayer(8, 0);
});
downButton.addEventListener('click', () => {
  moveLocalPlayer(0, 8);
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp') {
    moveLocalPlayer(0, -8);
  } else if (event.key === 'ArrowLeft') {
    moveLocalPlayer(-8, 0);
  } else if (event.key === 'ArrowRight') {
    moveLocalPlayer(8, 0);
  } else if (event.key === 'ArrowDown') {
    moveLocalPlayer(0, 8);
  }
});
window.addEventListener('beforeunload', () => {
  removeLocalPlayer();
});

renderBoard();
