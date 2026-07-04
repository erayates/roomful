# Session summarizer (alpha)

Audience: users.

> **Alpha.** The `SessionSummary` shape may change in a minor release.

The session summarizer answers **"what happened in this room?"** — a structured, replayable rollup
of who did what and when, derived from the [activity feed](engines-activity.md). Because it reads the
activity feed, it summarizes both human activity and, when you run an AI peer with
`recordActions`, its [agent actions](engines-activity.md) too. Pass a `narrate` hook to turn the
structured data into prose with an LLM; otherwise a built-in heuristic writes the summary line.

## Access

`summarizeSession` is a pure function over a list of activity entries:

```ts
import { summarizeSession } from '@roomful/core';

const summary = summarizeSession(room.useActivity().getEntries());
console.log(summary.text); // "42 events · 3 participants · over 5m · top: stroke (30), agent:cheer (6) · 6 agent."
```

In React, the `useSessionSummarizer` hook recomputes the summary as the feed changes:

```tsx
import { useSessionSummarizer } from '@roomful/react';

function SessionHeader() {
  const summary = useSessionSummarizer();
  return <p>{summary.text}</p>;
}
```

## Interface

```ts
function summarizeSession(
  entries: readonly ActivityEntry[],
  options?: SessionSummarizerOptions,
): SessionSummary;

interface SessionSummarizerOptions {
  // Render the summary text yourself, e.g. with an LLM. Omit for the built-in heuristic.
  narrate?: (summary: Omit<SessionSummary, 'text'>) => string;
}

interface SessionSummary {
  eventCount: number; // total events summarized
  participants: SessionParticipant[]; // most active first
  actionCounts: Record<string, number>; // events keyed by activity type
  agentActionCount: number; // events from AI agents
  humanActionCount: number; // events from humans
  startedAt: number | null; // first event timestamp (ms), or null when empty
  endedAt: number | null; // last event timestamp (ms), or null when empty
  durationMs: number; // span from first to last event
  text: string; // narrated or heuristic summary line
}

interface SessionParticipant {
  peer: Peer; // carries live presence
  eventCount: number;
  isAgent: boolean; // an AI agent (see isAgentPeer)
}
```

## Semantics

- **Pure and replayable** — the summary is a deterministic function of the entries you pass, so it
  works on a live feed, a persisted one, or a recorded/replayed session.
- **Participants** are ordered by event count (most active first); each is flagged `isAgent` so a UI
  can distinguish AI teammates from humans.
- **`narrate`** receives the full structured summary (minus `text`) — return whatever prose you want.
  A common pattern is to send `actionCounts` and `participants` to an LLM for a natural-language
  recap.

## Narrate with an LLM

```ts
const summary = summarizeSession(entries, {
  narrate: (base) =>
    callYourModel(
      `Summarize this session in one sentence: ${JSON.stringify({
        participants: base.participants.length,
        actions: base.actionCounts,
      })}`,
    ),
});
```

## Related docs

- [Activity engine](engines-activity.md) — the event feed the summarizer reads.
- [Activity storage](activity-storage.md) — persist the feed so summaries survive reloads.
