# Pointer Engine

Audience: users.

The pointer (laser pointer) primitive broadcasts a peer's transient "beam" position while active and surfaces remote peers' beams so they can be drawn. It is close to the cursor engine, but a beam is only broadcast while the pointer is active — deactivating (or unmounting/disconnecting) makes the beam disappear for every peer.

Like cursors and viewport, it rides the room's event channel and uses normalized (`0`–`1`) coordinates, so no relay change is required.

## Access

```ts
const pointer = room.usePointer({ throttleMs: 32 });
```

## Interface

```ts
interface PointerEngine {
  mount(element: HTMLElement): void;
  unmount(): void;
  activate(): void;
  deactivate(): void;
  subscribe(cb: (beams: PointerBeam[]) => void): Unsubscribe;
  getAll(): PointerBeam[];
  render(options?: PointerRenderOptions): Unsubscribe;
}
```

Behavior notes:

- `mount(element)` tracks `mousemove` on a container and is also the target for the built-in renderer.
- `activate()` starts broadcasting the local pointer beam; while active, pointer movement over the mounted element is broadcast to peers.
- `deactivate()` stops broadcasting and announces an inactive beam so peers drop it (the laser disappears).
- `subscribe()` fires with the current remote beams whenever an inbound beam is applied or dropped. `getAll()` returns the latest remote beams (excluding the local peer).
- `render(options)` paints a built-in, zero-config DOM overlay over the container and returns a cleanup function. Apps that draw their own pointers can ignore it and use `subscribe()` instead.
- Outbound positions are throttled by `throttleMs` (default `32`).
- The beam's `name` and `color` are resolved from the peer's presence by the room.

## State Shape

```ts
interface PointerBeam {
  peerId: string;
  name: string; // resolved from presence
  color: string; // resolved from presence
  x: number; // normalized 0–1 of the tracked container
  y: number; // normalized 0–1 of the tracked container
  active: boolean; // an inactive beam is dropped by peers
}
```

## Render Options

```ts
interface PointerRenderOptions {
  container?: string | HTMLElement; // defaults to the mounted element
  style?: PointerStyle; // defaults to 'laser'
  zIndex?: number; // defaults to 9999
}

type PointerStyle = 'laser' | 'spotlight' | 'crosshair' | 'dot';
```

Built-in overlay styles:

- `laser` — a colored dot with a soft glow (the default).
- `spotlight` — a soft radial dim centered on the point.
- `crosshair` — thin horizontal and vertical cross lines through the point.
- `dot` — a plain colored dot.

## Example

```ts
const pointer = room.usePointer();

pointer.mount(document.getElementById('slide') as HTMLElement);
pointer.activate();

// Zero-config overlay, or subscribe and draw your own.
const stopRendering = pointer.render({ style: 'spotlight' });

const unsubscribe = pointer.subscribe((beams) => {
  for (const beam of beams) {
    console.log(beam.name, beam.x, beam.y, beam.active);
  }
});

stopRendering();
unsubscribe();
```

## Adapter Usage

### React

```tsx
import { useEffect } from 'react';
import { usePointer } from '@roomful/react';

function Slide() {
  const { ref, beams, activate, render } = usePointer();

  useEffect(() => render({ style: 'laser' }), [render]);

  return (
    <div ref={ref} onPointerEnter={activate}>
      <p>Active beams: {beams.length}</p>
    </div>
  );
}
```

`usePointer()` returns `{ ref, beams, activate, deactivate, render }`.

### Vue

```vue
<script setup lang="ts">
import { usePointer } from '@roomful/vue';

const { ref: slideRef, beams, activate } = usePointer();
</script>

<template>
  <div ref="slideRef" @pointerenter="activate">
    <p>Active beams: {{ beams.length }}</p>
  </div>
</template>
```

`ref` is a `ShallowRef<HTMLElement | null>`; `beams` is a readonly ref. `mount(element)` / `unmount()` are also available.

### Svelte

```svelte
<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const { pointer } = roomful('my-room');
</script>

<div use:pointer.mount on:pointerenter={() => pointer.activate()}>
  <p>Active beams: {$pointer.length}</p>
</div>
```

`pointer` is a readable store of remote `PointerBeam[]`; `pointer.mount` is a Svelte action, and `activate`/`deactivate`/`render` are methods on the store.

### Solid

```tsx
import { onMount } from 'solid-js';
import { usePointer } from '@roomful/solid';

function Slide() {
  const { ref, beams, activate, render } = usePointer();
  onMount(() => render({ style: 'crosshair' }));

  return (
    <div ref={ref} onPointerEnter={activate}>
      <p>Active beams: {beams().length}</p>
    </div>
  );
}
```

`beams` is a Solid accessor.

### Angular

```ts
import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { injectPointer, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-slide',
  standalone: true,
  providers: [provideRoomful('my-room')],
  template: `<div #slide>Active beams: {{ pointer.beams().length }}</div>`,
})
export class SlideComponent implements AfterViewInit {
  private readonly slide = viewChild.required<ElementRef<HTMLElement>>('slide');
  protected readonly pointer = injectPointer();

  ngAfterViewInit(): void {
    this.pointer.mount(this.slide().nativeElement);
    this.pointer.activate();
    this.pointer.render({ style: 'laser' });
  }
}
```

`injectPointer()` returns `beams` as a signal plus `mount`/`unmount`/`activate`/`deactivate`/`render`.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [Cursor engine](engines-cursors.md)
- [Performance](performance.md)
- [Types](types.md)
- [Docs index](../README.md)
