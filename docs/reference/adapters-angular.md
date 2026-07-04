# Angular Adapter (`@roomful/angular`)

Audience: users.

Requires Angular 17 or newer. The adapter exposes a functional, signal-based API: a `provideRoomful()` provider plus a family of `inject*` helpers that return Angular **signals**.

## Provider

`provideRoomful(roomId, options)` returns `EnvironmentProviders`. It creates the room, connects it, wires the optional `onConnect`/`onDisconnect`/`onError` callbacks, and disconnects automatically when the surrounding injection context is destroyed (via `DestroyRef`). Add it to a standalone component's `providers`, a route's providers, or the application bootstrap.

```ts
import { provideRoomful } from '@roomful/angular';

provideRoomful('my-room', {
  transport: 'auto',
  presence: { name: 'Alice', color: '#4F46E5' },
  onConnect: () => console.log('connected'),
  onError: (error) => console.error(error),
});
```

## Standalone Component Example

```ts
import { Component } from '@angular/core';
import { injectPresence, injectSharedState, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-room',
  standalone: true,
  providers: [
    provideRoomful('my-room', {
      presence: { name: 'Alice', color: '#4F46E5' },
    }),
  ],
  template: `
    <p>{{ votes().yes }} yes / {{ votes().no }} no</p>
    <ul>
      @for (peer of presence.others(); track peer.id) {
        <li>{{ peer.name }}</li>
      }
    </ul>
    <button (click)="voteYes()">Vote Yes</button>
  `,
})
export class RoomComponent {
  protected readonly presence = injectPresence();
  private readonly shared = injectSharedState('poll-votes', {
    initialValue: { yes: 0, no: 0 },
    strategy: 'crdt',
  });

  protected readonly votes = this.shared[0];

  protected voteYes(): void {
    const setVotes = this.shared[1];
    setVotes((v) => ({ ...v, yes: v.yes + 1 }));
  }
}
```

## Injectables

Call these inside the `provideRoomful` context. Reactive values are returned as signals — read them by calling the signal (`presence.others()`, `status()`).

| Injectable                     | Returns                                              | Purpose                        |
| ------------------------------ | ---------------------------------------------------- | ------------------------------ |
| `injectRoom()`                 | `Room`                                               | access low-level room instance |
| `injectPresence()`             | `{ self, others, all, update, replace }`             | reactive participant signals   |
| `injectCursors(opts?)`         | `{ cursors, mount, unmount }`                        | cursor tracking/rendering      |
| `injectSharedState(key, opts)` | `[signal, setter]`                                   | synchronized state             |
| `injectAwareness()`            | `{ others, set, setFocus, setSelection, setTyping }` | ephemeral peer context         |
| `injectEvent(name, handler)`   | `emit` function                                      | subscribe and emit             |
| `injectPeers()`                | `Signal<Peer[]>`                                     | remote peers                   |
| `injectConnectionStatus()`     | `Signal<RoomStatus>`                                 | current room status            |

### Collaboration primitives (v1.5)

Reactive members are returned as signals; mount viewport/pointer on an element from `afterNextRender` or `ngAfterViewInit` (Angular has no callback ref).

| Injectable                    | Returns                                                                                           | Purpose                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `injectViewport(opts?)`       | `{ states, mount, unmount, broadcast, stopBroadcast, present, stopPresenting, follow, unfollow }` | follow a peer's scroll/zoom ([viewport](engines-viewport.md))                     |
| `injectLocks()`               | `{ locks, acquire, release, releaseAll, isLocked, getHolder }`                                    | advisory locks over UI keys ([locks](engines-locks.md))                           |
| `injectLockState(key)`        | `Signal<LockState \| null>`                                                                       | one key's holder, for lock-on-focus ([locks](engines-locks.md))                   |
| `injectPointer(opts?)`        | `{ beams, mount, unmount, activate, deactivate, render }`                                         | laser pointer beams ([pointer](engines-pointer.md))                               |
| `injectComments(opts?)`       | `{ threads, add, reply, resolve, reopen, getByElement, getOpen }`                                 | anchored comment threads ([comments](engines-comments.md))                        |
| `injectActivity(opts?)`       | `{ entries, record }`                                                                             | room activity feed, newest first ([activity](engines-activity.md))                |
| `injectFieldPresence()`       | `{ fields, setActiveField, getFieldPeers }`                                                       | who's on which field ([field presence](engines-field-presence.md))                |
| `injectAgentApprovals(opts?)` | `{ proposals, pending, approve, reject, propose }`                                                | human-in-the-loop agent approvals ([agent approvals](engines-agent-approvals.md)) |
| `injectHistory(opts?)`        | `{ timeline, canUndo, canRedo, capture, transaction, undo, redo }`                                | undo/redo plus shared timeline ([history](engines-history.md))                    |

- `injectPresence()` returns `self`, `others`, and `all` as signals plus the `update`/`replace` presence mutators.
- `injectAwareness()` returns the remote `others` signal plus the `set`/`setFocus`/`setSelection`/`setTyping` mutators.
- `injectSharedState(key, opts)` returns a `[signal, setter]` tuple. The setter mirrors React `useState`: it accepts the next value or an updater `(previous) => next`, and returns the resolved value. `opts` forwards directly to `room.useState(...)`.
- `injectEvent(name, handler)` subscribes to a channel and returns a stable `emit(payload)` function for the same channel.

## Injection Context Requirement

Every `inject*` helper must run in an **injection context** — a component or service constructor, a field initializer (as in the example above), or inside `runInInjectionContext`. Calling one outside an injection context throws (the helpers assert this via `assertInInjectionContext`). This is also how each helper registers its `DestroyRef` teardown, so subscriptions are cleaned up with the host.

`injectRoom()` (and any helper that depends on it) throws a `RoomfulError` when called outside a `provideRoomful()` context.

## Cursors

Angular has no React-style callback ref, so mount the cursor engine on an element imperatively. Obtain the engine in an injection context, then call `mount(el)` from `afterNextRender` or `ngAfterViewInit`:

```ts
import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { injectCursors, provideRoomful } from '@roomful/angular';

@Component({
  selector: 'app-board',
  standalone: true,
  providers: [provideRoomful('my-room')],
  template: `<div #board>Remote cursors: {{ cursors.cursors().length }}</div>`,
})
export class BoardComponent implements AfterViewInit {
  private readonly board = viewChild.required<ElementRef<HTMLElement>>('board');
  protected readonly cursors = injectCursors();

  ngAfterViewInit(): void {
    this.cursors.mount(this.board().nativeElement);
  }
}
```

## Shared State Notes

- `injectSharedState()` binds one shared-state engine per room. A second `injectSharedState` for the same room must use the same `key` and compatible `opts`.
- `opts` forwards directly to `room.useState(...)`, including `initialValue`, `strategy`, and `persist`.
- The setter returns the resolved value and is a no-op when the next value is structurally equal to the current one.

## Related Docs

- [Reference index](README.md)
- [Core API](core-api.md)
- [State, awareness, events](engines-state-awareness-events.md)
- [Viewport engine](engines-viewport.md)
- [Locking engine](engines-locks.md)
- [Pointer engine](engines-pointer.md)
- [Comments engine](engines-comments.md)
- [History engine](engines-history.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
