# @roomful/angular

Angular bindings for [Roomful](https://github.com/erayates/roomful) — signal-based providers and injectables for real-time collaboration (presence, cursors, shared state, awareness, events, viewport sync, laser pointer, locks, comments, and history).

> **Stable — v1.0**, plus the v1.5 collaboration primitives. The API is stable and ready for production.

## Install

```bash
npm install @roomful/core @roomful/angular
```

Requires Angular 17 or newer.

## Usage

```ts
import { Component } from '@angular/core';
import { injectPresence, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-room',
  standalone: true,
  providers: [
    provideRoomful('my-room', {
      presence: { name: 'Alice', color: '#4F46E5' },
    }),
  ],
  template: `
    <ul>
      @for (peer of presence.others(); track peer.id) {
        <li>{{ peer.name }}</li>
      }
    </ul>
  `,
})
export class RoomComponent {
  protected readonly presence = injectPresence();
}
```

`provideRoomful(roomId, options)` returns `EnvironmentProviders`: it creates the room, connects it, wires the optional `onConnect`/`onDisconnect`/`onError` callbacks, and disconnects automatically when the injection context is destroyed.

Inside any component or service created within that provider context, call the injectables:

- `injectRoom()` — the underlying `Room` instance.
- `injectPresence()` — `{ self, others, all }` signals plus `update`/`replace`.
- `injectCursors()` — a `cursors` signal plus `mount(el)` / `unmount()` (call `mount` from `afterNextRender` or `ngAfterViewInit`).
- `injectSharedState(key, options)` — `[signal, setter]`.
- `injectAwareness()` — an `others` signal plus `set`/`setTyping`/`setFocus`/`setSelection`.
- `injectEvent(name, handler)` — returns an `emit(payload)` function.
- `injectPeers()` — a signal of remote peers.
- `injectConnectionStatus()` — a signal of the current `RoomStatus`.

The v1.5 collaboration primitives follow the same `inject*` pattern: `injectViewport()`, `injectLocks()` (plus `injectLockState(key)`), `injectPointer()`, `injectComments()`, and `injectHistory()` — see the [reference docs](https://github.com/erayates/roomful/blob/main/docs/reference/adapters-angular.md).

Every `inject*` helper must be called in an injection context (a component/service constructor, a field initializer, or `runInInjectionContext`).

## Documentation

See the [Roomful repository](https://github.com/erayates/roomful) for the full API reference.

## License

MIT
