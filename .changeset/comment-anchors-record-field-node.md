---
'@roomful/core': minor
---

Extend comment anchors (EP-15 / #152): a `CommentAnchor` can now pin a thread to a record
(`{ recordId }`), a field within a record (`{ recordId, fieldId }`, e.g. a table cell), a standalone
form field (`{ fieldId }`), or a tree/graph node (`{ nodeId }`) — alongside the existing element,
point, and text-range anchors. This enables collaborative comments on forms, tables, and node
graphs. Anchors are validated on `add` and round-trip through sync and storage unchanged.
