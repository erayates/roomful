---
'@roomful/core': minor
---

Add `addAIPeer(roomId, options)` — attach a headless, programmatically-driven ("AI") peer to a room. It joins as a second participant over the room's transport and a pluggable `agent` drives its presence, cursor, and events on a tick loop; it runs in a browser tab, Node, or a server (no DOM). Ships `createHeuristicAgent()` for a zero-dependency demo bot (wandering cursor + reactions + rotating mood) — pair `addAIPeer` with an LLM-backed agent for real intelligence. The demo gains an "Add AI teammate" button that drops the bot into whichever mini-app is active.
