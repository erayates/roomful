# CRDT Bridge Decision

**Status:** Decision made, March 2026
**Scope:** EP-21 #214 — evaluate CRDT options for cross-platform (web + Dart/Flutter) use.

## Context

Roomful uses Yjs for the comments engine (`packages/core/src/engines/comments.ts`) and a custom LWW (last-writer-wins) engine for shared state. The protocol already carries `crdt:sync` messages. For Dart/Flutter (EP-11/EP-12), we need a CRDT library that works on both platforms.

## Options Evaluated

| Option                                | Web | Dart              | Interop                 | Bundle size    | Maintained |
| ------------------------------------- | --- | ----------------- | ----------------------- | -------------- | ---------- |
| **Yjs** (current)                     | ✅  | ❌ (no Dart port) | N/A                     | ~40 KB gzipped | ✅ Active  |
| **y_crdt** (Dart)                     | ❌  | ✅                | ❌ Different data model | ~60 KB         | ✅ Active  |
| **Automerge**                         | ✅  | ❌                | ❌                      | ~70 KB         | ✅ Active  |
| **Custom LWW** (current state engine) | ✅  | ✅ (can port)     | ✅ Same algo            | ~2 KB          | ✅ Ours    |

## Decision: Stay with Yjs for comments, keep custom LWW for state

**Rationale:**

- Yjs is battle-tested, has a mature JS ecosystem, and is already integrated.
- Comments are the primary Yjs consumer. They're durable and benefit from CRDT semantics.
- For Dart/Flutter: comments sync can use the relay as intermediary (JS client writes Yjs, Dart client reads via relay normalization). No need for a Dart Yjs port.
- Shared state uses custom LWW — simple, cross-platform (portable algorithm), no library dependency.
- `y_crdt` uses a different data model than Yjs — cross-platform interop would require a translation layer, negating the benefit.

**What we skip:**

- No Dart CRDT library dependency. LWW ports to Dart trivially.
- No Automerge migration. Yjs is sufficient.

**When to revisit:**

- If Dart/Flutter needs offline-first comments (CRDT merge semantics on mobile), evaluate `y_crdt` with a translation bridge.
- If Yjs maintenance languishes, re-evaluate Automerge for the web side.
