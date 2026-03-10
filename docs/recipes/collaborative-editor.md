# Recipe: Collaborative Editor

Audience: users.

Goal: combine room lifecycle, awareness, and Yjs CRDT primitives for document editing.

## Scenario

A Notion-style editor where users can:

- edit content concurrently
- see collaborator cursors/identity
- view typing/focus signals

## Example

```ts
import { createRoom } from '@flockjs/core';
import * as Y from 'yjs';

const room = createRoom(`doc-${documentId}`, {
  transport: 'auto',
  presence: { name: user.name, color: user.color },
});

await room.connect();

const ydoc: Y.Doc = room.getYDoc();
const provider = room.getYProvider();

// CodeMirror-style editors usually bind to a shared Y.Text.
const codeMirrorText = ydoc.getText('content');

// ProseMirror-style editors usually bind to a shared Y.XmlFragment.
const proseMirrorRoot = ydoc.getXmlFragment('prosemirror');

// Use the shared Yjs awareness instance for selections and collaborator state.
const awareness = provider.awareness;
```

## Integration Notes

- Pass `codeMirrorText` and `awareness` to your CodeMirror Yjs binding.
- Pass `proseMirrorRoot` and `awareness` to your ProseMirror Yjs binding.
- `room.getYDoc()` and `room.getYProvider()` are singletons per room instance, so reuse them across editor mounts.
- `provider.synced` becomes `true` after the room finishes its initial Yjs sync handshake with connected peers.
- Keep non-document metadata in shared state if you want a simpler `lww` or structured CRDT model beside the editor document.

## Failure Modes

- Connection interruption: rely on reconnection and replay behavior.
- Late joiners: wait for `provider.synced` before assuming the full document is present locally.
- Conflicting metadata writes: use `lww` for simple title/tag fields.

## Related Docs

- [Advanced features](../reference/advanced.md)
- [State, awareness, events](../reference/engines-state-awareness-events.md)
- [Quickstart](../getting-started/quickstart.md)
- [Docs index](../README.md)
