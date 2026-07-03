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

## Related docs

- [State, awareness, events](engines-state-awareness-events.md)
- [Locking engine](engines-locks.md)
- [Reference index](README.md)
