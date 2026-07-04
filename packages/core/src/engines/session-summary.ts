import { isAgentPeer } from '../ai-peer';
import type { ActivityEntry, Peer } from '../types';

/**
 * One participant's footprint in a session summary.
 */
export interface SessionParticipant {
  /** The participant, carrying presence. */
  peer: Peer;
  /** How many events they produced. */
  eventCount: number;
  /** Whether they are an AI agent (see {@link isAgentPeer}). */
  isAgent: boolean;
}

/**
 * A structured, replayable summary of a room session, derived from its activity feed. Alpha — the
 * shape may change in a minor release.
 */
export interface SessionSummary {
  /** Total events summarized. */
  eventCount: number;
  /** Participants, most active first. */
  participants: SessionParticipant[];
  /** Event counts keyed by activity type. */
  actionCounts: Record<string, number>;
  /** How many events were produced by AI agents. */
  agentActionCount: number;
  /** How many events were produced by humans. */
  humanActionCount: number;
  /** The first event's timestamp, or `null` when empty. */
  startedAt: number | null;
  /** The last event's timestamp, or `null` when empty. */
  endedAt: number | null;
  /** The span from first to last event (ms). */
  durationMs: number;
  /** A human-readable summary line — from `narrate` when provided, else a built-in heuristic. */
  text: string;
}

/**
 * Configures {@link summarizeSession}.
 */
export interface SessionSummarizerOptions {
  /**
   * Turns the structured summary into prose — e.g. an LLM call. When omitted, a built-in heuristic
   * template is used. Receives the summary without its `text` field.
   */
  narrate?: (summary: Omit<SessionSummary, 'text'>) => string;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return '<1s';
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${String(minutes)}m` : `${String(minutes)}m ${String(remainder)}s`;
}

function heuristicText(summary: Omit<SessionSummary, 'text'>): string {
  if (summary.eventCount === 0) {
    return 'No activity yet.';
  }

  const people = summary.participants.length;
  const top = Object.entries(summary.actionCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([type, count]) => `${type} (${String(count)})`)
    .join(', ');

  const parts = [
    `${String(summary.eventCount)} event${summary.eventCount === 1 ? '' : 's'}`,
    `${String(people)} participant${people === 1 ? '' : 's'}`,
    `over ${formatDuration(summary.durationMs)}`,
  ];
  if (top.length > 0) {
    parts.push(`top: ${top}`);
  }
  if (summary.agentActionCount > 0) {
    parts.push(`${String(summary.agentActionCount)} agent`);
  }

  return `${parts.join(' · ')}.`;
}

/**
 * Summarizes a room session from its activity feed — a structured, replayable rollup of who did what
 * and when. Pair it with `room.useActivity().getEntries()` (which captures human activity and, via
 * `addAIPeer`'s `recordActions`, agent actions). Pass `narrate` to render prose with an LLM.
 *
 * Alpha; see `docs/reference/session-summarizer.md`.
 *
 * @param entries - The session's activity entries.
 * @param options - Optional narration hook.
 * @returns The structured session summary.
 */
export function summarizeSession(
  entries: readonly ActivityEntry[],
  options?: SessionSummarizerOptions,
): SessionSummary {
  const byActor = new Map<string, SessionParticipant>();
  const actionCounts: Record<string, number> = {};
  let agentActionCount = 0;
  let startedAt: number | null = null;
  let endedAt: number | null = null;

  for (const entry of entries) {
    const existing = byActor.get(entry.actor.id);
    if (existing) {
      existing.eventCount += 1;
    } else {
      byActor.set(entry.actor.id, {
        peer: entry.actor,
        eventCount: 1,
        isAgent: isAgentPeer(entry.actor),
      });
    }

    actionCounts[entry.type] = (actionCounts[entry.type] ?? 0) + 1;
    if (isAgentPeer(entry.actor)) {
      agentActionCount += 1;
    }

    if (startedAt === null || entry.timestamp < startedAt) {
      startedAt = entry.timestamp;
    }
    if (endedAt === null || entry.timestamp > endedAt) {
      endedAt = entry.timestamp;
    }
  }

  const participants = [...byActor.values()].sort((left, right) => {
    return right.eventCount - left.eventCount;
  });

  const base: Omit<SessionSummary, 'text'> = {
    eventCount: entries.length,
    participants,
    actionCounts,
    agentActionCount,
    humanActionCount: entries.length - agentActionCount,
    startedAt,
    endedAt,
    durationMs: startedAt !== null && endedAt !== null ? endedAt - startedAt : 0,
  };

  return { ...base, text: options?.narrate ? options.narrate(base) : heuristicText(base) };
}
