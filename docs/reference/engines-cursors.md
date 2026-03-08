# Cursor Engine

Audience: users.

Cursors synchronize pointer position across peers.

## Access

```ts
const cursors = room.useCursors<{ tool: 'pen' | 'eraser' }>();
```

## Interface

```ts
interface CursorEngine<TCursor extends CursorData = CursorData> {
  mount(el: HTMLElement): void;
  unmount(): void;
  render(options?: CursorRenderOptions): void;
  subscribe(cb: (positions: CursorPosition<TCursor>[]) => void): Unsubscribe;
  getPositions(): CursorPosition<TCursor>[];
  setPosition(position: Partial<CursorPosition<TCursor>>): void;
}
```

## Position Shape

```ts
type CursorData = Record<string, unknown>;

type CursorPosition<TCursor extends CursorData = CursorData> = {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  xAbsolute: number;
  yAbsolute: number;
  element?: string;
  idle: boolean;
} & Partial<TCursor>;
```

Extra cursor fields are preserved across peer sync as long as they are serializable. Reserved runtime fields such as `userId`, `name`, `color`, `x`, `y`, `xAbsolute`, `yAbsolute`, `element`, and `idle` remain owned by the cursor engine and room transport layer.

## Render Options

```ts
cursors.render({
  container: '#canvas',
  style: 'default',
  showName: true,
  showIdle: false,
  idleTimeout: 3000,
  zIndex: 9999,
});
```

Built-in renderer styles:

- `default`: SVG arrow cursor with a name label.
- `dot`: compact dot marker with an optional label.
- `pointer`: compact pointer marker with an optional label.
- Unknown style strings fall back to `default`.

Renderer behavior:

- Cursor nodes are absolutely positioned inside the render container.
- `showName === false` hides the built-in name label.
- `showIdle === false` hides idle peers until they move again.
- `showIdle !== false` keeps idle peers rendered and marks them idle in the DOM.
- Built-in cursor movement uses CSS transitions for smooth interpolation.

## Custom Renderer Pattern

```ts
cursors.mount(document.getElementById('board') as HTMLElement);

cursors.subscribe((positions) => {
  for (const pos of positions) {
    const id = `cursor-${pos.userId}`;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.getElementById('board')?.appendChild(el);
    }

    el.style.position = 'absolute';
    el.style.left = `${pos.x * 100}%`;
    el.style.top = `${pos.y * 100}%`;
    el.textContent = pos.name;
  }
});
```

## Performance Boundaries

- Throttle high-frequency cursor updates.
- Keep cursor payloads small.
- Use awareness for semantic state, not pointer telemetry.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [UI components](ui-components.md)
- [Performance](performance.md)
- [Docs index](../README.md)
