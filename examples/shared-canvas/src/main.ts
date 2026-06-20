import './styles.css';

import type { Peer, PresenceData, Room, StateEngine, Unsubscribe } from '@roomful/core';
import { createRoom } from '@roomful/core';

interface CanvasPresence extends PresenceData {
  color?: string;
  name?: string;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  id: string;
  points: Point[];
}

interface CanvasState {
  strokes: Stroke[];
}

const defaultState: CanvasState = {
  strokes: [],
};

let room: Room<CanvasPresence> | null = null;
let sharedState: StateEngine<CanvasState> | null = null;
let subscriptions: Unsubscribe[] = [];
let strokes: Stroke[] = [];
let activeStroke: Stroke | null = null;

const roomInput = getElement('room-id', HTMLInputElement);
const nameInput = getElement('name', HTMLInputElement);
const colorInput = getElement('color', HTMLInputElement);
const connectButton = getElement('connect', HTMLButtonElement);
const clearButton = getElement('clear', HTMLButtonElement);
const statusText = getElement('status', HTMLElement);
const peerList = getElement('peers', HTMLUListElement);
const canvas = getElement('canvas', HTMLCanvasElement);
const context = getCanvasContext(canvas);

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

function getCanvasContext(canvasElement: HTMLCanvasElement): CanvasRenderingContext2D {
  const nextContext = canvasElement.getContext('2d');
  if (!nextContext) {
    throw new TypeError('Shared canvas requires a 2D canvas context.');
  }

  return nextContext;
}

function setStatus(value: string): void {
  statusText.textContent = value;
}

function renderPeers(peers: Peer<CanvasPresence>[]): void {
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
    item.style.borderColor = typeof peer.color === 'string' ? peer.color : '#cbe0d8';
    peerList.append(item);
  }
}

function resizeCanvasBuffer(): void {
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
  canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawStroke(stroke: Stroke): void {
  if (stroke.points.length < 2) {
    return;
  }

  context.strokeStyle = stroke.color;
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();

  const firstPoint = stroke.points[0];
  if (!firstPoint) {
    return;
  }

  context.moveTo(firstPoint.x, firstPoint.y);
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
}

function redraw(): void {
  resizeCanvasBuffer();
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (const stroke of strokes) {
    drawStroke(stroke);
  }

  if (activeStroke) {
    drawStroke(activeStroke);
  }
}

function readCanvasPoint(event: PointerEvent): Point {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function beginStroke(event: PointerEvent): void {
  canvas.setPointerCapture(event.pointerId);
  activeStroke = {
    color: colorInput.value,
    id: `${room?.peerId ?? 'local'}-${Date.now()}`,
    points: [readCanvasPoint(event)],
  };
}

function extendStroke(event: PointerEvent): void {
  if (!activeStroke) {
    return;
  }

  activeStroke = {
    ...activeStroke,
    points: [...activeStroke.points, readCanvasPoint(event)],
  };
  redraw();
}

function commitStroke(): void {
  if (!activeStroke || activeStroke.points.length < 2) {
    activeStroke = null;
    redraw();
    return;
  }

  const nextStrokes = [...strokes, activeStroke];
  strokes = nextStrokes;
  sharedState?.set({ strokes: nextStrokes });
  activeStroke = null;
  redraw();
}

async function disconnectRoom(): Promise<void> {
  const currentRoom = room;
  subscriptions.forEach((unsubscribe) => unsubscribe());
  subscriptions = [];
  room = null;
  sharedState = null;

  if (currentRoom) {
    await currentRoom.disconnect();
  }
}

async function connectRoom(): Promise<void> {
  await disconnectRoom();

  const nextRoom = createRoom<CanvasPresence>(roomInput.value.trim() || 'shared-canvas-room', {
    presence: {
      color: colorInput.value,
      name: nameInput.value.trim() || 'Canvas peer',
    },
    transport: 'broadcast',
  });
  const presence = nextRoom.usePresence();
  const state = nextRoom.useState<CanvasState>({
    initialValue: defaultState,
    strategy: 'crdt',
  });

  room = nextRoom;
  sharedState = state;
  subscriptions = [
    presence.subscribe(renderPeers),
    state.subscribe((value) => {
      strokes = value.strokes;
      redraw();
    }),
    nextRoom.on('connected', () => {
      setStatus(`connected as ${nextRoom.peerId}`);
      renderPeers(presence.getAll());
      strokes = state.get().strokes;
      redraw();
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

connectButton.addEventListener('click', () => {
  void connectRoom();
});
clearButton.addEventListener('click', () => {
  strokes = [];
  sharedState?.set({ strokes });
  redraw();
});
canvas.addEventListener('pointerdown', beginStroke);
canvas.addEventListener('pointermove', extendStroke);
canvas.addEventListener('pointerup', commitStroke);
canvas.addEventListener('pointercancel', commitStroke);
window.addEventListener('resize', redraw);

redraw();
