# History Engine

Audience: users.

History provides collaborative undo/redo plus a shared activity timeline. Undo/redo is **per-peer**: each peer only reverts and replays its own changes to the shared CRDT document, conflict-free, so one peer's undo never destroys another peer's concurrent work. The timeline, by contrast, is **shared**: every peer's captures converge into one ordered log that the whole room observes.

## Access

```ts
const history = room.useHistory({ maxEntries: 100, captureInterval: 500 });
```

## Interface

```ts
interface HistoryEngine {
  capture(action: string, payload?: unknown): void;
  transaction(name: string, fn: () => void): void;
  undo(): Promise<void>;
  redo(): Promise<void>;
  canUndo(): boolean;
  canRedo(): boolean;
  timeline(): TimelineEntry[];
  subscribe(callback: (timeline: TimelineEntry[]) => void): Unsubscribe;
}
```

Behavior notes:

- `capture(action, payload?)` records a timeline entry without wrapping a mutation. A string `payload` becomes the entry description; otherwise the description defaults to `action`.
- `transaction(name, fn)` runs `fn`, capturing every shared-CRDT mutation it makes as a single undoable timeline entry. Calls within the `captureInterval` debounce window merge into one undoable unit.
- `undo()` reverts the local peer's most recent tracked transaction; `redo()` replays the most recently undone one. Both resolve once applied.
- `canUndo()` / `canRedo()` report whether an undo/redo would have an effect.
- `timeline()` returns the full shared timeline of every peer's entries, oldest first.
- `subscribe()` fires immediately with the current timeline, then on every local or remote change — including undo/redo that affects `canUndo`/`canRedo`.

## State Shape

```ts
interface TimelineEntry {
  id: string;
  peerId: string;
  peerName: string; // resolved from presence at capture time, falls back to peerId
  action: string; // e.g. 'draw' or 'move-shape'
  timestamp: number; // epoch ms
  description: string; // defaults to action when none is provided
}
```

## Options

```ts
interface HistoryOptions {
  maxEntries?: number; // per-peer timeline cap and undo-stack bound, default 100
  captureInterval?: number; // debounce window in ms for merging captures, default 500
}
```

## Transport and Semantics

Undo/redo run through a Yjs `UndoManager` scoped to the local peer's transaction origin, and the shared timeline lives in a dedicated `Y.Array` on the room's shared document, distinct from the shared-state root. Both ride the existing CRDT sync channel and reach late joiners through the sync handshake.

Scope and limits:

- Undo/redo act on the local peer's mutations to the shared CRDT `Y.Doc` — the data behind `useState({ strategy: 'crdt' })`. Because the manager only tracks the local peer's origin, remote peers' transactions are invisible to it, which is what makes undo/redo per-peer and conflict-free.
- App-local component state and the `'lww'` state strategy are **NOT** auto-reverted; reverting those is the app's responsibility.
- A bare `capture()` records a timeline entry (metadata) and is only undoable when paired with `transaction()` mutations.

## Example

```ts
const history = room.useHistory();

// Wrap shared-CRDT mutations so they undo as one unit.
history.transaction('add-shape', () => {
  shapes.set(shapeId, { x: 10, y: 20 });
});

// Log an action the app applies itself.
history.capture('export', 'Exported as PNG');

if (history.canUndo()) {
  await history.undo();
}

const unsubscribe = history.subscribe((timeline) => {
  for (const entry of timeline) {
    console.log(`${entry.peerName}: ${entry.description}`);
  }
});

unsubscribe();
```

## Adapter Usage

### React

```tsx
import { useHistory } from '@roomful/react';

function Toolbar() {
  const { timeline, canUndo, canRedo, undo, redo } = useHistory();

  return (
    <div>
      <button disabled={!canUndo} onClick={() => void undo()}>
        Undo
      </button>
      <button disabled={!canRedo} onClick={() => void redo()}>
        Redo
      </button>
      <p>Activity: {timeline.length} entries</p>
    </div>
  );
}
```

`useHistory(options?)` returns `{ timeline, canUndo, canRedo, capture, transaction, undo, redo }`, where `timeline`, `canUndo`, and `canRedo` are reactive.

### Vue

```vue
<script setup lang="ts">
import { useHistory } from '@roomful/vue';

const { timeline, canUndo, undo } = useHistory();
</script>

<template>
  <button :disabled="!canUndo" @click="undo()">Undo</button>
  <p>Activity: {{ timeline.length }} entries</p>
</template>
```

`timeline`, `canUndo`, and `canRedo` are readonly refs.

### Svelte

```svelte
<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const { history } = roomful('my-room', { history: { maxEntries: 200 } });
  const canUndo = history.canUndo;
</script>

<button disabled={!$canUndo} on:click={() => history.undo()}>Undo</button>
<p>Activity: {$history.length} entries</p>
```

`history` is a readable store of the `TimelineEntry[]` timeline; `history.canUndo` and `history.canRedo` are nested readable `boolean` stores (subscribe to them with `$`), and `capture`/`transaction`/`undo`/`redo` are methods. The timeline cap and debounce are configured via the `history` option on the `roomful(...)` factory.

### Solid

```tsx
import { useHistory } from '@roomful/solid';

function Toolbar() {
  const { timeline, canUndo, undo } = useHistory();
  return (
    <button disabled={!canUndo()} onClick={() => void undo()}>
      Undo ({timeline().length})
    </button>
  );
}
```

`timeline`, `canUndo`, and `canRedo` are Solid accessors.

### Angular

```ts
import { Component } from '@angular/core';
import { injectHistory, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  providers: [provideRoomful('my-room')],
  template: `
    <button [disabled]="!history.canUndo()" (click)="history.undo()">Undo</button>
    <p>Activity: {{ history.timeline().length }} entries</p>
  `,
})
export class ToolbarComponent {
  protected readonly history = injectHistory();
}
```

`injectHistory(options?)` returns `timeline`, `canUndo`, and `canRedo` as signals plus `capture`/`transaction`/`undo`/`redo`.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Types](types.md)
- [Docs index](../README.md)
