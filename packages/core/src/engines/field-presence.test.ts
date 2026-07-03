import { describe, expect, it, vi } from 'vitest';

import type { AwarenessState, Peer } from '../types';
import {
  createFieldPresenceEngine,
  FIELD_PRESENCE_KEY,
  type FieldPresenceEngineContext,
} from './field-presence';

function state(peerId: string, fieldId: string | null): AwarenessState {
  return fieldId === null ? { peerId } : { peerId, [FIELD_PRESENCE_KEY]: fieldId };
}

function createFakeAwareness(initial: AwarenessState[]): {
  awareness: FieldPresenceEngineContext['awareness'];
  emit(next: AwarenessState[]): void;
  setSpy: ReturnType<typeof vi.fn>;
} {
  const subscribers = new Set<(peers: AwarenessState[]) => void>();
  let current = initial;
  const setSpy = vi.fn();

  return {
    awareness: {
      set: setSpy,
      getAll: () => current,
      subscribe: (callback) => {
        subscribers.add(callback);
        callback(current);
        return () => {
          subscribers.delete(callback);
        };
      },
    },
    emit(next) {
      current = next;
      for (const callback of subscribers) {
        callback(current);
      }
    },
    setSpy,
  };
}

function resolvePeer(peerId: string): Peer {
  return { id: peerId, joinedAt: 0, lastSeen: 0, name: `Peer ${peerId}` };
}

describe('FieldPresenceEngine', () => {
  it('writes the active field to the reserved awareness key', () => {
    const fake = createFakeAwareness([]);
    const engine = createFieldPresenceEngine({
      selfPeerId: 'self',
      awareness: fake.awareness,
      resolvePeer,
    });

    engine.setActiveField('user.email');
    expect(fake.setSpy).toHaveBeenCalledWith({ [FIELD_PRESENCE_KEY]: 'user.email' });

    engine.setActiveField(null);
    expect(fake.setSpy).toHaveBeenLastCalledWith({ [FIELD_PRESENCE_KEY]: null });
  });

  it('returns the remote peers on a field, resolved with presence and excluding self', () => {
    const fake = createFakeAwareness([
      state('self', 'user.email'), // self is ignored even when on the field
      state('peer-a', 'user.email'),
      state('peer-b', 'user.email'),
      state('peer-c', 'user.name'),
      state('peer-d', null),
    ]);
    const engine = createFieldPresenceEngine({
      selfPeerId: 'self',
      awareness: fake.awareness,
      resolvePeer,
    });

    const emailPeers = engine.getFieldPeers('user.email');
    expect(emailPeers.map((peer) => peer.id)).toEqual(['peer-a', 'peer-b']);
    expect(emailPeers[0]?.name).toBe('Peer peer-a');
    expect(engine.getFieldPeers('user.name').map((peer) => peer.id)).toEqual(['peer-c']);
    expect(engine.getFieldPeers('nobody')).toEqual([]);
  });

  it('groups active fields, ordered by field id, ignoring fieldless peers', () => {
    const fake = createFakeAwareness([
      state('peer-a', 'zeta'),
      state('peer-b', 'alpha'),
      state('peer-c', 'alpha'),
      state('peer-d', null),
    ]);
    const engine = createFieldPresenceEngine({
      selfPeerId: 'self',
      awareness: fake.awareness,
      resolvePeer,
    });

    const fields = engine.getActiveFields();
    expect(fields.map((field) => field.fieldId)).toEqual(['alpha', 'zeta']);
    expect(fields[0]?.peers.map((peer) => peer.id)).toEqual(['peer-b', 'peer-c']);
    expect(fields[1]?.peers.map((peer) => peer.id)).toEqual(['peer-a']);
  });

  it('fires the subscriber immediately and on every awareness change, and unsubscribes', () => {
    const fake = createFakeAwareness([state('peer-a', 'alpha')]);
    const engine = createFieldPresenceEngine({
      selfPeerId: 'self',
      awareness: fake.awareness,
      resolvePeer,
    });

    const seen: string[][] = [];
    const unsubscribe = engine.subscribe((fields) => {
      seen.push(fields.map((field) => field.fieldId));
    });

    expect(seen).toEqual([['alpha']]);

    fake.emit([state('peer-a', 'alpha'), state('peer-b', 'beta')]);
    expect(seen.at(-1)).toEqual(['alpha', 'beta']);

    unsubscribe();
    fake.emit([]);
    expect(seen).toHaveLength(2);
  });
});
