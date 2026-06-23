import type { ReactElement } from 'react';

import type { DemoIdentity } from '../demo-types';
import { CanvasApp } from './canvas-app';
import { CursorsApp } from './cursors-app';
import { NotesApp } from './notes-app';
import { PollApp } from './poll-app';
import { ReactionsApp } from './reactions-app';

export interface MiniAppProps {
  identity: DemoIdentity;
}

export interface MiniAppDefinition {
  id: string;
  title: string;
  tagline: string;
  icon: string;
  primitives: string;
  Component: (props: MiniAppProps) => ReactElement;
}

const CANVAS: MiniAppDefinition = {
  id: 'canvas',
  title: 'Shared canvas',
  tagline: 'Draw together — every stroke syncs as conflict-free shared state.',
  icon: '✦',
  primitives: 'Cursors · Events · CRDT state',
  Component: CanvasApp,
};

export const MINI_APPS: readonly MiniAppDefinition[] = [
  CANVAS,
  {
    id: 'cursors',
    title: 'Live cursors',
    tagline: 'Move your pointer — everyone in the room sees it instantly.',
    icon: '➤',
    primitives: 'Cursors · Presence',
    Component: CursorsApp,
  },
  {
    id: 'reactions',
    title: 'Reactions',
    tagline: 'Fire emoji that float up on every screen at once.',
    icon: '✸',
    primitives: 'Fire-and-forget events',
    Component: ReactionsApp,
  },
  {
    id: 'notes',
    title: 'Sticky notes',
    tagline: 'Drop notes on a shared board and edit them together.',
    icon: '▢',
    primitives: 'CRDT shared state',
    Component: NotesApp,
  },
  {
    id: 'poll',
    title: 'Live poll',
    tagline: 'Vote and watch the tally move in real time.',
    icon: '◧',
    primitives: 'Shared state · Presence',
    Component: PollApp,
  },
];

export function findMiniApp(id: string | null): MiniAppDefinition {
  return MINI_APPS.find((app) => app.id === id) ?? CANVAS;
}
