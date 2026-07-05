---
'@roomful/core': minor
---

Add an error catalog. `ROOMFUL_ERROR_CATALOG` maps every `RoomfulErrorCode` to a `{ title, description, remediation, recoverable }` entry, and `describeRoomfulError(code)` looks one up — so an app can turn a thrown `RoomfulError` into an actionable message. The catalog is typed as an exhaustive record (a new code is a compile error until documented). Exports `ErrorCatalogEntry`. The codes are also documented in `docs/reference/errors.md`.
