import { createRoom } from './room';
import type { CursorPosition, Peer, PresenceData, TransportMode, Unsubscribe } from './types';

/**
 * A custom event the AI peer observed since the previous agent tick.
 */
export interface AIPeerEvent<TPresence extends PresenceData = PresenceData> {
  /** The event channel name. */
  name: string;
  /** The event payload. */
  payload: unknown;
  /** The peer that sent it. */
  from: Peer<TPresence>;
}

/**
 * The room snapshot plus action handles handed to an {@link AIPeerAgent} each
 * tick. Reads are a snapshot taken at the start of the tick; the action methods
 * apply immediately.
 */
export interface AIPeerContext<TPresence extends PresenceData = PresenceData> {
  /** The tick counter, incremented after each agent run (starts at 0). */
  readonly tick: number;
  /** The AI peer's own peer snapshot. */
  readonly self: Peer<TPresence>;
  /** Every other peer in the room. */
  readonly others: Peer<TPresence>[];
  /** The current cursor positions of all peers. */
  readonly cursors: CursorPosition[];
  /** Events observed since the previous tick (only for `observeEvents` names). */
  readonly events: readonly AIPeerEvent<TPresence>[];
  /** Moves the AI peer's cursor to a normalized position (each axis 0..1). */
  moveCursor(x: number, y: number): void;
  /** Merges a patch into the AI peer's presence. */
  setPresence(data: Partial<TPresence>): void;
  /** Emits a custom event to the room. */
  emit(name: string, payload: unknown): void;
}

/**
 * Decides what the AI peer does on a given tick. Called once per `tickMs` with a
 * fresh {@link AIPeerContext}. May be async (e.g. an LLM call) — overlapping runs
 * are skipped, so a slow agent simply ticks less often.
 */
export type AIPeerAgent<TPresence extends PresenceData = PresenceData> = (
  context: AIPeerContext<TPresence>,
) => void | Promise<void>;

/**
 * Configures {@link addAIPeer}.
 */
export interface AddAIPeerOptions<TPresence extends PresenceData = PresenceData> {
  /** The brain — decides the peer's actions each tick. */
  agent: AIPeerAgent<TPresence>;
  /** The peer's initial presence (name, color, custom fields). */
  presence?: TPresence;
  /** The transport to join on. Match the human room's transport. */
  transport?: TransportMode;
  /** The relay URL, when joining over `websocket`. */
  relayUrl?: string;
  /** How often (ms) the agent runs. Defaults to 1200. */
  tickMs?: number;
  /** Event channel names to buffer and surface to the agent via `context.events`. */
  observeEvents?: string[];
}

/**
 * A live AI peer. Call {@link AIPeer.stop} to remove it from the room.
 */
export interface AIPeer {
  /** The AI peer's id in the room. */
  readonly peerId: string;
  /** Stops the agent loop and disconnects the peer. */
  stop(): Promise<void>;
}

/**
 * Adds a programmatic ("AI") peer to a room: it joins as a second participant
 * over the given transport and an {@link AIPeerAgent} drives its presence,
 * cursor, and events on a tick loop. Headless — no DOM required — so it runs in
 * a browser tab alongside the human client, in Node, or on a server.
 *
 * The agent is pluggable: pair it with {@link createHeuristicAgent} for a
 * zero-dependency demo bot, or write one that calls an LLM to decide actions.
 *
 * @typeParam TPresence - The room presence shape.
 * @param roomId - The room to join (the same id the humans are in).
 * @param options - The agent and join configuration.
 * @returns A handle exposing the peer id and a `stop()` teardown.
 */
export function addAIPeer<TPresence extends PresenceData = PresenceData>(
  roomId: string,
  options: AddAIPeerOptions<TPresence>,
): AIPeer {
  const room = createRoom<TPresence>(roomId, {
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.relayUrl ? { relayUrl: options.relayUrl } : {}),
    ...(options.presence ? { presence: options.presence } : {}),
  });

  const presence = room.usePresence();
  const cursors = room.useCursors();
  const eventEngine = room.useEvents();

  let tick = 0;
  let running = true;
  let busy = false;
  let buffered: AIPeerEvent<TPresence>[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  const unsubscribes: Unsubscribe[] = [];

  for (const name of options.observeEvents ?? []) {
    unsubscribes.push(
      eventEngine.on(name, (payload: unknown, from: Peer<TPresence>) => {
        buffered.push({ name, payload, from });
      }),
    );
  }

  const runAgent = async (): Promise<void> => {
    if (!running || busy) {
      return;
    }

    busy = true;
    const observed = buffered;
    buffered = [];

    const context: AIPeerContext<TPresence> = {
      tick,
      self: presence.getSelf(),
      others: presence.getAll().filter((peer) => {
        return peer.id !== room.peerId;
      }),
      cursors: cursors.getPositions(),
      events: observed,
      moveCursor: (x, y) => {
        cursors.setPosition({ x, y });
      },
      setPresence: (data) => {
        presence.update(data);
      },
      emit: (name, payload) => {
        eventEngine.emit(name, payload);
      },
    };

    try {
      await options.agent(context);
    } catch {
      // The agent is user code (possibly an LLM call) — never let its failure
      // tear down the peer; just skip this tick.
    }

    tick += 1;
    busy = false;
  };

  const intervalMs =
    typeof options.tickMs === 'number' && options.tickMs > 0 ? options.tickMs : 1200;

  void room
    .connect()
    .then(() => {
      if (!running) {
        return;
      }

      void runAgent();
      timer = setInterval(() => {
        void runAgent();
      }, intervalMs);
    })
    .catch(() => {
      return undefined;
    });

  return {
    peerId: room.peerId,
    async stop() {
      running = false;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }

      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }

      await room.disconnect().catch(() => {
        return undefined;
      });
    },
  };
}

/**
 * Configures {@link createHeuristicAgent}.
 */
export interface HeuristicAgentOptions {
  /** Emit reactions on this event channel (skipped if unset). */
  reactionEvent?: string;
  /** The pool of reaction payloads to emit verbatim on `reactionEvent`. */
  reactions?: unknown[];
  /** The presence field to set a rotating mood on (skipped if unset). */
  moodField?: string;
  /** The mood pool. */
  moods?: string[];
  /** Emit a reaction every N ticks. Defaults to 5. */
  reactEveryTicks?: number;
}

function pick<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return items[Math.floor(Math.random() * items.length)];
}

/**
 * A zero-dependency demo agent: it wanders its cursor smoothly, optionally fires
 * periodic reactions and rotates a mood presence field, and reacts back when it
 * sees others react. Enough to make a believable teammate for a demo without an
 * LLM; swap it for an LLM-backed {@link AIPeerAgent} for real intelligence.
 *
 * @param options - Reaction/mood behavior configuration.
 * @returns An {@link AIPeerAgent}.
 */
export function createHeuristicAgent(options: HeuristicAgentOptions = {}): AIPeerAgent {
  const reactEvery =
    typeof options.reactEveryTicks === 'number' && options.reactEveryTicks > 0
      ? options.reactEveryTicks
      : 5;
  let targetX = 0.5;
  let targetY = 0.5;
  let x = 0.5;
  let y = 0.5;

  return (context) => {
    // Retarget every few ticks, then ease toward the target for smooth motion.
    if (context.tick % 4 === 0) {
      targetX = 0.1 + Math.random() * 0.8;
      targetY = 0.1 + Math.random() * 0.8;
    }

    x += (targetX - x) * 0.4;
    y += (targetY - y) * 0.4;
    context.moveCursor(x, y);

    // React back when someone else just reacted, otherwise fire one periodically.
    const reactionPool = options.reactions ?? [];
    if (typeof options.reactionEvent === 'string' && reactionPool.length > 0) {
      const reactedThisTick = context.events.some((event) => event.name === options.reactionEvent);
      const periodic = context.tick % reactEvery === reactEvery - 1;
      if (reactedThisTick || periodic) {
        const payload = pick(reactionPool);
        if (payload !== undefined) {
          context.emit(options.reactionEvent, payload);
        }
      }
    }

    if (
      typeof options.moodField === 'string' &&
      options.moods !== undefined &&
      options.moods.length > 0 &&
      context.tick % (reactEvery * 2) === 0
    ) {
      const mood = pick(options.moods);
      if (mood !== undefined) {
        context.setPresence({ [options.moodField]: mood });
      }
    }
  };
}
