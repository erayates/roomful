# Field presence engine

Audience: users.

Field presence answers **"who else is on this field right now"** — a form input, a table cell, a
record attribute. It's a field-oriented view of the [awareness](engines-state-awareness-events.md)
channel: the local peer declares which field it's active on, and every peer sees which remote peers
are on which field. Purpose-built for collaborative forms, tables, and admin records.

## Access

```ts
const fieldPresence = room.useFieldPresence();
```

## Interface

```ts
interface FieldPresenceEngine {
  setActiveField(fieldId: string | null): void; // declare the local peer's field (null to clear)
  getFieldPeers(fieldId: string): Peer[]; // remote peers on a field, with live presence
  getActiveFields(): FieldPresenceState[]; // every field with a remote peer, ordered by id
  subscribe(callback: (fields: FieldPresenceState[]) => void): Unsubscribe;
}

interface FieldPresenceState {
  fieldId: string; // an app-defined id, e.g. 'user.email' or 'row-42:status'
  peers: Peer[]; // the remote peers on the field
}
```

- `setActiveField(fieldId)` declares the field the local peer is editing — call it on focus, and
  `setActiveField(null)` on blur.
- `getFieldPeers(fieldId)` and `getActiveFields()` return only **remote** peers (you are never in
  your own list), resolved with live presence so you can render their name and color.
- `subscribe(cb)` fires immediately with the current fields, then on every change.

## Semantics

- **Rides awareness** — field presence is stored on a reserved awareness key, so it converges over
  the same channel as cursors, typing, and focus. No relay change is needed.
- **Ephemeral** — like all presence, it reflects only connected peers and clears when a peer leaves
  or goes idle. It is not persisted.
- **One field per peer** — a peer is on at most one field at a time (the last `setActiveField`
  wins), matching how focus works.

## Example

Pair it with [record locks](engines-locks.md) for safe collaborative editing — presence shows who is
looking, a lock enforces who may write:

```ts
const fieldPresence = room.useFieldPresence();
const locks = room.useLocks();

input.addEventListener('focus', () => {
  fieldPresence.setActiveField('user.email');
  void locks.acquire('user.email');
});
input.addEventListener('blur', () => {
  fieldPresence.setActiveField(null);
  locks.release('user.email');
});

fieldPresence.subscribe((fields) => renderFieldAvatars(fields));
```

## Adapter usage

### React

```tsx
import { useFieldPresence } from '@roomful/react';

function Field({ id, label }: { id: string; label: string }): JSX.Element {
  const { setActiveField, getFieldPeers } = useFieldPresence();
  const peers = getFieldPeers(id);
  return (
    <label>
      {label}
      <input onBlur={() => setActiveField(null)} onFocus={() => setActiveField(id)} />
      {peers.map((peer) => (
        <span key={peer.id} title={peer.name ?? peer.id}>
          ●
        </span>
      ))}
    </label>
  );
}
```

`useFieldPresence()` returns `{ fields, setActiveField, getFieldPeers }`; `fields` is the reactive
list of active fields, and `getFieldPeers(id)` reads that snapshot.

### Vue

```vue
<script setup lang="ts">
import { useFieldPresence } from '@roomful/vue';

const { setActiveField, getFieldPeers } = useFieldPresence();
</script>

<template>
  <label>
    Email
    <input @blur="setActiveField(null)" @focus="setActiveField('user.email')" />
    <span v-for="peer in getFieldPeers('user.email')" :key="peer.id" :title="peer.name ?? peer.id">
      ●
    </span>
  </label>
</template>
```

`useFieldPresence()` returns `{ fields, setActiveField, getFieldPeers }`; `fields` is a readonly ref,
and `getFieldPeers(id)` reads the reactive snapshot.

### Svelte

The `roomful(...)` adapter exposes `fieldPresence` as a readable store of `FieldPresenceState[]` with
`setActiveField` and `getFieldPeers` attached:

```svelte
<script lang="ts">
  import { roomful } from '@roomful/svelte';

  const room = roomful('my-room');
  const { fieldPresence } = room;
</script>

<label>
  Email
  <input on:blur={() => fieldPresence.setActiveField(null)} on:focus={() => fieldPresence.setActiveField('user.email')} />
  {#each fieldPresence.getFieldPeers('user.email') as peer (peer.id)}
    <span title={peer.name ?? peer.id}>●</span>
  {/each}
</label>
```

### Solid

```tsx
import { useFieldPresence } from '@roomful/solid';

function Field(props: { id: string }) {
  const { setActiveField, getFieldPeers } = useFieldPresence();
  return (
    <label>
      <input onBlur={() => setActiveField(null)} onFocus={() => setActiveField(props.id)} />
      <For each={getFieldPeers(props.id)}>
        {(peer) => <span title={peer.name ?? peer.id}>●</span>}
      </For>
    </label>
  );
}
```

`useFieldPresence()` returns `{ fields, setActiveField, getFieldPeers }`; `fields` is an accessor and
`getFieldPeers(id)` reads the reactive snapshot.

### Angular

`injectFieldPresence()` must run in an injection context and returns `{ fields, setActiveField, getFieldPeers }`, where `fields` is a `Signal`:

```ts
import { Component } from '@angular/core';
import { injectFieldPresence } from '@roomful/angular';

@Component({
  selector: 'app-email-field',
  template: `
    <input (blur)="fp.setActiveField(null)" (focus)="fp.setActiveField('user.email')" />
    @for (peer of fp.getFieldPeers('user.email'); track peer.id) {
      <span [title]="peer.name ?? peer.id">●</span>
    }
  `,
})
export class EmailFieldComponent {
  protected readonly fp = injectFieldPresence();
}
```

## Related docs

- [State, awareness, events](engines-state-awareness-events.md)
- [Locking engine](engines-locks.md)
- [Reference index](README.md)
