---
'@roomful/core': minor
---

Formalize the `.roomful` session format. New `parseRoomfulRecording(value)` validates a value loaded from a `.roomful` file into a `RoomfulRecording` — checking the version, the envelope fields, and every frame's signal (through the same transport-signal parser the live wire path uses) — or returns `null` for a malformed or unsupported-version file, so a bad file can never reach `replay()`. Exports `parseRoomfulRecording` and `RECORDING_FORMAT_VERSION`. The format is documented in `docs/reference/roomful-format.md` (schema, versioning, compression guidance).
