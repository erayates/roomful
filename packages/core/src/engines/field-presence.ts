import type {
  AwarenessEngine,
  AwarenessState,
  FieldPresenceEngine,
  FieldPresenceState,
  Peer,
  Unsubscribe,
} from '../types';

/**
 * The reserved awareness metadata key that carries the local peer's active field. Riding the
 * awareness channel means field presence needs no new wire protocol or relay change — it converges
 * with cursors, typing, and focus over the same transport.
 */
export const FIELD_PRESENCE_KEY = '__roomful:field__';

/**
 * Wires the field-presence engine to the room's awareness channel and peer registry.
 */
export interface FieldPresenceEngineContext {
  readonly selfPeerId: string;
  awareness: Pick<AwarenessEngine, 'set' | 'getAll' | 'subscribe'>;
  resolvePeer(peerId: string): Peer | null;
}

function readField(state: AwarenessState): string | null {
  const value = state[FIELD_PRESENCE_KEY];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Creates a field-presence engine: a field-oriented view of the awareness channel that answers "who
 * else is on this field right now". `setActiveField` declares the local peer's field; the reads
 * return the *remote* peers on a field (resolved with live presence), so a form can show avatars on
 * the inputs peers are editing. Built for collaborative forms, tables, and admin records.
 *
 * @param context - The awareness channel plus a peer resolver and the local peer id.
 * @returns The field-presence engine bound to the room.
 */
export function createFieldPresenceEngine(
  context: FieldPresenceEngineContext,
): FieldPresenceEngine {
  const resolveActor = (peerId: string): Peer => {
    return context.resolvePeer(peerId) ?? { id: peerId, joinedAt: 0, lastSeen: 0 };
  };

  const remoteStates = (): AwarenessState[] => {
    return context.awareness.getAll().filter((state) => {
      return state.peerId !== context.selfPeerId;
    });
  };

  const peersOnField = (fieldId: string): Peer[] => {
    return remoteStates()
      .filter((state) => {
        return readField(state) === fieldId;
      })
      .map((state) => {
        return resolveActor(state.peerId);
      });
  };

  const activeFields = (): FieldPresenceState[] => {
    const byField = new Map<string, Peer[]>();
    for (const state of remoteStates()) {
      const fieldId = readField(state);
      if (fieldId === null) {
        continue;
      }

      const peers = byField.get(fieldId) ?? [];
      peers.push(resolveActor(state.peerId));
      byField.set(fieldId, peers);
    }

    // Stable, deterministic order so consumers get a referentially predictable snapshot.
    return [...byField.entries()]
      .map(([fieldId, peers]) => {
        return { fieldId, peers };
      })
      .sort((left, right) => {
        return left.fieldId < right.fieldId ? -1 : left.fieldId > right.fieldId ? 1 : 0;
      });
  };

  return {
    setActiveField(fieldId): void {
      context.awareness.set({ [FIELD_PRESENCE_KEY]: fieldId });
    },
    getFieldPeers(fieldId): Peer[] {
      return peersOnField(fieldId);
    },
    getActiveFields(): FieldPresenceState[] {
      return activeFields();
    },
    subscribe(callback): Unsubscribe {
      // awareness.subscribe fires immediately, so the consumer gets the current fields at once.
      return context.awareness.subscribe(() => {
        callback(activeFields());
      });
    },
  };
}
