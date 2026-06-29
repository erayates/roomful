# Comments Engine

Audience: users.

Comments are collaborative, anchored discussion threads. Unlike the ephemeral presence-style primitives, threads are persistent collaborative state: they sync across peers over the room's existing CRDT channel and survive late joins.

## Access

```ts
const comments = room.useComments({ storage: 'memory' });
```

## Interface

```ts
interface CommentsEngine {
  add(input: { anchor: CommentAnchor; text: string }): Promise<CommentThread>;
  thread(id: string): CommentThreadHandle;
  getAll(): CommentThread[];
  getByElement(elementId: string): CommentThread[];
  getOpen(): CommentThread[];
  subscribe(callback: (threads: CommentThread[]) => void): Unsubscribe;
}

interface CommentThreadHandle {
  reply(text: string): Promise<CommentThread>;
  resolve(): Promise<CommentThread>;
  reopen(): Promise<CommentThread>;
}
```

Behavior notes:

- `add({ anchor, text })` opens a new thread authored by the local peer at `anchor`; the thread `id` and `createdAt` are generated. It resolves to the created thread.
- `thread(id)` resolves a handle exposing `reply(text)`, `resolve()`, and `reopen()`. The handle methods no-op against an unknown id until it surfaces, then resolve to the latest thread.
- `getAll()` returns every thread, oldest first; `getByElement(elementId)` returns threads anchored to an element (element or text-range anchors); `getOpen()` returns the unresolved threads.
- `subscribe()` fires immediately with the current threads, then on every local or remote mutation.

## Data Shapes

```ts
type CommentAnchor =
  | { elementId: string } // pin to an element
  | { x: number; y: number } // pin to a point in canvas/coordinate space
  | { from: number; to: number; elementId: string }; // pin to a text-selection range

interface Comment {
  id: string;
  author: Peer;
  text: string;
  createdAt: number;
}

interface CommentThread {
  id: string;
  anchor: CommentAnchor;
  author: Peer;
  text: string;
  createdAt: number;
  resolved: boolean;
  replies: Comment[];
}
```

## Options

```ts
interface CommentsOptions {
  storage?: 'memory' | 'indexeddb' | 'rest';
  restEndpoint?: string; // used when storage is 'rest'
}
```

Storage backends:

- `memory` (default) — the synced, in-room collaborative structure.
- `indexeddb` — additionally persists threads to the browser so they reload on the next session.
- `rest` — additionally mirrors threads to the `restEndpoint`: threads are loaded from it on init and mutations are POSTed back.

## Transport and Persistence

Threads live in a dedicated `Y.Map` on the room's shared Yjs document, distinct from the shared-state root, so every `add`/`reply`/`resolve`/`reopen` is a CRDT mutation that converges across peers and reaches late joiners through the existing sync handshake — no relay change, and no collision with a user's `useState`/`useSharedState`. The `indexeddb` and `rest` backends layer extra persistence on top of this synced structure.

## Example

```ts
const comments = room.useComments();

const thread = await comments.add({
  anchor: { elementId: 'paragraph-3' },
  text: 'Should we rephrase this?',
});

await comments.thread(thread.id).reply('Agreed, on it.');
await comments.thread(thread.id).resolve();

const unsubscribe = comments.subscribe((threads) => {
  console.log('open threads:', threads.filter((t) => !t.resolved).length);
});

unsubscribe();
```

## Adapter Usage

### React

```tsx
import { useComments } from '@roomful/react';

function Thread({ elementId }: { elementId: string }) {
  const { threads, add, reply, resolve } = useComments();
  const open = threads.filter((t) => !t.resolved);

  return (
    <div>
      <button onClick={() => add({ anchor: { elementId }, text: 'New note' })}>Comment</button>
      <p>Open threads: {open.length}</p>
    </div>
  );
}
```

`useComments(options?)` returns `{ threads, add, reply, resolve, reopen, getByElement, getOpen }`, where `threads` re-renders on any local or remote thread change.

### Vue

```vue
<script setup lang="ts">
import { useComments } from '@roomful/vue';

const { threads, add } = useComments();
</script>

<template>
  <p>Threads: {{ threads.length }}</p>
</template>
```

`threads` is a readonly ref of `CommentThread[]`.

### Svelte

```svelte
<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const { comments } = roomful('my-room', { comments: { storage: 'indexeddb' } });
</script>

<p>Threads: {$comments.length}</p>
<button on:click={() => comments.add({ anchor: { elementId: 'p-3' }, text: 'Note' })}>
  Comment
</button>
```

`comments` is a readable store of `CommentThread[]` with `add`/`reply`/`resolve`/`reopen`/`getByElement`/`getOpen` methods. The storage backend is configured via the `comments` option on the `roomful(...)` factory.

### Solid

```tsx
import { useComments } from '@roomful/solid';

function Threads() {
  const { threads, add } = useComments();
  return <p>Threads: {threads().length}</p>;
}
```

`threads` is a Solid accessor.

### Angular

```ts
import { Component } from '@angular/core';
import { injectComments, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-threads',
  standalone: true,
  providers: [provideRoomful('my-room')],
  template: `<p>Threads: {{ comments.threads().length }}</p>`,
})
export class ThreadsComponent {
  protected readonly comments = injectComments();
}
```

`injectComments(options?)` returns `threads` as a signal plus `add`/`reply`/`resolve`/`reopen`/`getByElement`/`getOpen`.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Types](types.md)
- [Docs index](../README.md)
