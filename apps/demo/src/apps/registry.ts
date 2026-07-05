import type { ReactElement } from 'react';

import type { DemoIdentity } from '../demo-types';
import { ActivityApp } from './activity-app';
import { CanvasApp } from './canvas-app';
import { ChatApp } from './chat-app';
import { ChecklistApp } from './checklist-app';
import { CommentsApp } from './comments-app';
import { CursorsApp } from './cursors-app';
import { FormApp } from './form-app';
import { MoodApp } from './mood-app';
import { NotesApp } from './notes-app';
import { PollApp } from './poll-app';
import { ReactionsApp } from './reactions-app';
import { TopologyApp } from './topology-app';

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
    id: 'chat',
    title: 'Cursor chat',
    tagline: 'Type a message — it pops up beside your cursor for everyone.',
    icon: '❝',
    primitives: 'Cursors · Events',
    Component: ChatApp,
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
    id: 'mood',
    title: 'Vibe check',
    tagline: 'Pick a vibe — it updates your presence for the whole room.',
    icon: '◉',
    primitives: 'Presence',
    Component: MoodApp,
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
    id: 'checklist',
    title: 'Checklist',
    tagline: 'Add and check off shared to-dos in real time.',
    icon: '✓',
    primitives: 'CRDT shared state',
    Component: ChecklistApp,
  },
  {
    id: 'poll',
    title: 'Live poll',
    tagline: 'Vote and watch the tally move in real time.',
    icon: '◧',
    primitives: 'Shared state · Presence',
    Component: PollApp,
  },
  {
    id: 'comments',
    title: 'Comments',
    tagline: 'Leave anchored comment threads and resolve them together.',
    icon: '❞',
    primitives: 'Comments engine',
    Component: CommentsApp,
  },
  {
    id: 'activity',
    title: 'Activity feed',
    tagline: 'A shared, durable feed — entries survive a reload.',
    icon: '⟳',
    primitives: 'Activity engine · Local storage',
    Component: ActivityApp,
  },
  {
    id: 'form',
    title: 'Safe form',
    tagline: 'Edit a shared form together — presence + locks keep it conflict-free.',
    icon: '▤',
    primitives: 'Field presence · Locks · CRDT state',
    Component: FormApp,
  },
  {
    id: 'topology',
    title: 'Network topology',
    tagline: 'See the room live — peers orbit you, each edge labeled with measured latency.',
    icon: '◉',
    primitives: 'Diagnostics · Presence · Transport',
    Component: TopologyApp,
  },
];

export function findMiniApp(id: string | null): MiniAppDefinition {
  return MINI_APPS.find((app) => app.id === id) ?? CANVAS;
}
