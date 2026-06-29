# Viewport Engine

Audience: users.

Viewport sync streams a peer's scroll, zoom, and dimensions so peers can follow one another's view. It rides the room's event channel and uses normalized coordinates, so no relay change is required.

## Access

```ts
const viewport = room.useViewport({ throttleMs: 64 });
```

## Interface

```ts
interface ViewportEngine {
  mount(element: HTMLElement): void;
  unmount(): void;
  broadcast(): void;
  stopBroadcast(): void;
  present(): void;
  stopPresenting(): void;
  follow(peerId: string): void;
  unfollow(): void;
  subscribe(cb: (states: ViewportState[]) => void): Unsubscribe;
  getAll(): ViewportState[];
  get(peerId: string): ViewportState | undefined;
}
```

Behavior notes:

- `mount()` observes a scrollable container element (not `window`) for `scroll`, and is where a followed peer's scroll is applied.
- `broadcast()` starts streaming the local viewport to all peers; `stopBroadcast()` stops it and drops the local viewport for peers.
- `present()` enters present mode: it broadcasts the local viewport and signals every peer to follow it until `stopPresenting()` is called.
- `follow(peerId)` applies that peer's normalized scroll to the mounted element as their viewport changes; `unfollow()` resumes independent scrolling.
- Zoom is carried in `ViewportState` for the app to apply — it is NOT applied to the mounted element automatically, since how zoom is applied is app-specific.
- `subscribe()` fires with the current remote states whenever an inbound frame is applied. `getAll()` and `get(peerId)` return remote viewport states (excluding the local peer).
- Outbound frames are throttled by `throttleMs` (default `64`).

## State Shape

```ts
interface ViewportState {
  peerId: string;
  scrollX: number; // 0–1 fraction of scrollable width, 0 when not scrollable
  scrollY: number; // 0–1 fraction of scrollable height, 0 when not scrollable
  zoom: number; // 1 === 100%
  viewportWidth: number; // CSS pixels
  viewportHeight: number; // CSS pixels
  focusedElement: string | null; // CSS selector, or null
}
```

Scroll coordinates are normalized to the `0`–`1` range (a fraction of the scrollable area) so they stay consistent across different screen sizes; each peer denormalizes them against its own container.

## Options

```ts
interface ViewportOptions {
  throttleMs?: number; // default 64
}
```

## Example

```ts
const viewport = room.useViewport();

viewport.mount(document.getElementById('board') as HTMLElement);
viewport.broadcast();

const unsubscribe = viewport.subscribe((states) => {
  for (const state of states) {
    console.log(state.peerId, state.scrollX, state.scrollY, state.zoom);
  }
});

// Follow a specific peer, or present to everyone.
viewport.follow('peer-123');
viewport.present();

unsubscribe();
```

## Adapter Usage

### React

```tsx
import { useViewport } from '@roomful/react';

function Board() {
  const { ref, states, broadcast, follow, present } = useViewport();

  return (
    <div ref={ref} style={{ overflow: 'auto' }}>
      <button onClick={broadcast}>Share my view</button>
      <button onClick={present}>Present</button>
      <p>Following peers: {states.length}</p>
      {states.map((s) => (
        <button key={s.peerId} onClick={() => follow(s.peerId)}>
          Follow {s.peerId}
        </button>
      ))}
    </div>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { useViewport } from '@roomful/vue';

const { ref: boardRef, states, broadcast, follow } = useViewport();
</script>

<template>
  <div ref="boardRef" style="overflow: auto">
    <button @click="broadcast">Share my view</button>
    <p>Following peers: {{ states.length }}</p>
  </div>
</template>
```

`ref` is a Vue `ShallowRef<HTMLElement | null>`; `states` is a readonly ref. `mount(element)` / `unmount()` are also available for explicit control.

### Svelte

```svelte
<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const { viewport } = roomful('my-room');
</script>

<div use:viewport.mount style="overflow: auto">
  <button on:click={() => viewport.broadcast()}>Share my view</button>
  <p>Following peers: {$viewport.length}</p>
</div>
```

`viewport` is a readable store of remote `ViewportState[]`; `viewport.mount` is a Svelte action, and `broadcast`/`stopBroadcast`/`present`/`stopPresenting`/`follow`/`unfollow` are methods on the store.

### Solid

```tsx
import { useViewport } from '@roomful/solid';

function Board() {
  const { ref, states, broadcast, follow } = useViewport();

  return (
    <div ref={ref} style={{ overflow: 'auto' }}>
      <button onClick={broadcast}>Share my view</button>
      <p>Following peers: {states().length}</p>
    </div>
  );
}
```

`states` is a Solid accessor — call it to read.

### Angular

```ts
import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { injectViewport, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-board',
  standalone: true,
  providers: [provideRoomful('my-room')],
  template: `<div #board style="overflow: auto">Following: {{ viewport.states().length }}</div>`,
})
export class BoardComponent implements AfterViewInit {
  private readonly board = viewChild.required<ElementRef<HTMLElement>>('board');
  protected readonly viewport = injectViewport();

  ngAfterViewInit(): void {
    this.viewport.mount(this.board().nativeElement);
    this.viewport.broadcast();
  }
}
```

`injectViewport()` returns `states` as a signal plus `mount`/`unmount`/`broadcast`/`stopBroadcast`/`present`/`stopPresenting`/`follow`/`unfollow`.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [Cursor engine](engines-cursors.md)
- [Performance](performance.md)
- [Types](types.md)
- [Docs index](../README.md)
