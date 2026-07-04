---
'@roomful/core': minor
---

Add an alpha session summarizer. `summarizeSession(entries, options?)` turns a room's activity feed into a structured, replayable rollup — participants (most active first, agents flagged), per-type action counts, agent vs human counts, time span, and a summary line. Pass a `narrate` hook to render the text with an LLM, or use the built-in heuristic. Exports `SessionSummary`, `SessionParticipant`, and `SessionSummarizerOptions`. Alpha: the shape may change in a minor release. See `docs/reference/session-summarizer.md`.
