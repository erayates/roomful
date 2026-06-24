import { describe, expect, it } from 'vitest';

import {
  areAwarenessArraysEqual,
  areCursorArraysEqual,
  areCursorPositionsEqual,
  arePeerArraysEqual,
  arePeersEqual,
  areStructuredValuesEqual,
  assertCompatibleSharedStateBinding,
  cloneStructuredValue,
  createSharedStateBinding,
  isObjectLike,
  isPlainObject,
  normalizeSharedStateStrategy,
  type SharedStateBinding,
} from './adapter-runtime';
import type { AwarenessState, CursorPosition, Peer } from './types';

describe('isObjectLike', () => {
  it('accepts non-array objects only', () => {
    expect(isObjectLike({})).toBe(true);
    expect(isObjectLike(null)).toBe(false);
    expect(isObjectLike([])).toBe(false);
    expect(isObjectLike(1)).toBe(false);
  });
});

describe('isPlainObject', () => {
  it('accepts only Object-prototype records', () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });
});

describe('areStructuredValuesEqual', () => {
  it('compares primitives and identity', () => {
    const shared = { a: 1 };
    expect(areStructuredValuesEqual(shared, shared)).toBe(true);
    expect(areStructuredValuesEqual(1, 1)).toBe(true);
    expect(areStructuredValuesEqual('a', 'a')).toBe(true);
    expect(areStructuredValuesEqual(1, 2)).toBe(false);
  });

  it('compares arrays element-wise', () => {
    expect(areStructuredValuesEqual([1, 2], [1, 2])).toBe(true);
    expect(areStructuredValuesEqual([1], [1, 2])).toBe(false);
    expect(areStructuredValuesEqual([1, 2], [1, 3])).toBe(false);
    expect(areStructuredValuesEqual([1], { 0: 1 })).toBe(false);
  });

  it('compares nested plain objects', () => {
    expect(areStructuredValuesEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(areStructuredValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(areStructuredValuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(areStructuredValuesEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('treats non-plain objects as unequal', () => {
    expect(areStructuredValuesEqual(new Date(0), new Date(0))).toBe(false);
    expect(areStructuredValuesEqual({ a: 1 }, null)).toBe(false);
  });
});

describe('cloneStructuredValue', () => {
  it('deep-clones objects and passes primitives through', () => {
    const source = { a: { b: 1 } };
    const clone = cloneStructuredValue(source);
    clone.a.b = 2;

    expect(source.a.b).toBe(1);
    expect(clone).not.toBe(source);
    expect(cloneStructuredValue(5)).toBe(5);
  });
});

describe('arePeersEqual', () => {
  const peer: Peer = { id: 'p1', joinedAt: 0, lastSeen: 1, color: 'red' };

  it('ignores the volatile lastSeen field', () => {
    expect(arePeersEqual(peer, peer)).toBe(true);
    expect(arePeersEqual(peer, { ...peer, lastSeen: 999 })).toBe(true);
  });

  it('detects changed, added, and renamed fields', () => {
    expect(arePeersEqual(peer, { ...peer, color: 'blue' })).toBe(false);
    expect(arePeersEqual(peer, { ...peer, extra: 1 })).toBe(false);
    expect(
      arePeersEqual(
        { id: 'p1', joinedAt: 0, lastSeen: 1, a: 1 },
        { id: 'p1', joinedAt: 0, lastSeen: 1, b: 1 },
      ),
    ).toBe(false);
  });
});

describe('arePeerArraysEqual', () => {
  const peer: Peer = { id: 'p1', joinedAt: 0, lastSeen: 1, color: 'red' };

  it('compares element-wise and short-circuits on identity', () => {
    const list: Peer[] = [peer];
    expect(arePeerArraysEqual(list, list)).toBe(true);
    expect(arePeerArraysEqual([peer], [{ ...peer }])).toBe(true);
    expect(arePeerArraysEqual([peer], [peer, peer])).toBe(false);
    expect(arePeerArraysEqual([peer], [{ ...peer, color: 'blue' }])).toBe(false);
  });
});

describe('areCursorPositionsEqual / areCursorArraysEqual', () => {
  const cursor: CursorPosition = {
    userId: 'u1',
    name: 'A',
    color: '#fff',
    x: 0,
    y: 0,
    xAbsolute: 0,
    yAbsolute: 0,
    idle: false,
  };

  it('compares cursor positions key-by-key', () => {
    expect(areCursorPositionsEqual(cursor, cursor)).toBe(true);
    expect(areCursorPositionsEqual(cursor, { ...cursor })).toBe(true);
    expect(areCursorPositionsEqual(cursor, { ...cursor, x: 9 })).toBe(false);
    expect(areCursorPositionsEqual(cursor, { ...cursor, extra: 1 })).toBe(false);
  });

  it('compares cursor arrays element-wise', () => {
    expect(areCursorArraysEqual([cursor], [{ ...cursor }])).toBe(true);
    expect(areCursorArraysEqual([cursor], [])).toBe(false);
    expect(areCursorArraysEqual([cursor], [{ ...cursor, y: 9 }])).toBe(false);
  });
});

describe('areAwarenessArraysEqual', () => {
  const entry: AwarenessState = { peerId: 'p1', typing: true };

  it('compares awareness arrays element-wise', () => {
    expect(areAwarenessArraysEqual([entry], [{ ...entry }])).toBe(true);
    expect(areAwarenessArraysEqual([entry], [])).toBe(false);
    expect(areAwarenessArraysEqual([entry], [{ ...entry, typing: false }])).toBe(false);
  });
});

describe('normalizeSharedStateStrategy', () => {
  it('defaults to lww and echoes valid strategies', () => {
    expect(normalizeSharedStateStrategy(undefined)).toBe('lww');
    expect(normalizeSharedStateStrategy('lww')).toBe('lww');
    expect(normalizeSharedStateStrategy('crdt')).toBe('crdt');
    expect(normalizeSharedStateStrategy(undefined, 'crdt')).toBe('crdt');
  });

  it('throws on unsupported strategies', () => {
    expect(() => normalizeSharedStateStrategy('custom')).toThrow(/not implemented in this runtime/);
  });
});

describe('createSharedStateBinding', () => {
  it('captures and clones the binding configuration', () => {
    const initial = { a: 1 };
    const binding = createSharedStateBinding('doc', {
      initialValue: initial,
      strategy: 'lww',
      persist: true,
    });

    expect(binding).toEqual({ key: 'doc', strategy: 'lww', initialValue: { a: 1 }, persist: true });
    expect(binding.initialValue).not.toBe(initial);
    expect(createSharedStateBinding('doc', { initialValue: 1 }).persist).toBe(false);
  });
});

describe('assertCompatibleSharedStateBinding', () => {
  const binding: SharedStateBinding = {
    key: 'doc',
    strategy: 'lww',
    initialValue: { a: 1 },
    persist: false,
  };

  it('accepts a matching re-bind', () => {
    expect(() => {
      assertCompatibleSharedStateBinding(binding, 'doc', {
        initialValue: { a: 1 },
        strategy: 'lww',
      });
    }).not.toThrow();
  });

  it('rejects a different key with adapter-specific wording', () => {
    expect(() => {
      assertCompatibleSharedStateBinding(binding, 'other', { initialValue: { a: 1 } });
    }).toThrow(/useSharedState\(\) is already bound to key "doc" for this room/);

    expect(() => {
      assertCompatibleSharedStateBinding(
        binding,
        'other',
        { initialValue: { a: 1 } },
        { method: 'state.shared', container: 'adapter' },
      );
    }).toThrow(/state\.shared\(\) is already bound to key "doc" for this adapter/);
  });

  it('rejects a changed strategy or initial value', () => {
    expect(() => {
      assertCompatibleSharedStateBinding(binding, 'doc', {
        initialValue: { a: 1 },
        strategy: 'crdt',
      });
    }).toThrow(/already configured with strategy "lww"/);

    expect(() => {
      assertCompatibleSharedStateBinding(binding, 'doc', { initialValue: { a: 2 } });
    }).toThrow(/received a different initialValue/);
  });

  it('allows enabling persistence for lww but blocks it elsewhere', () => {
    expect(() => {
      assertCompatibleSharedStateBinding(binding, 'doc', { initialValue: { a: 1 }, persist: true });
    }).not.toThrow();

    const crdtBinding: SharedStateBinding = {
      key: 'doc',
      strategy: 'crdt',
      initialValue: { a: 1 },
      persist: false,
    };
    expect(() => {
      assertCompatibleSharedStateBinding(crdtBinding, 'doc', {
        initialValue: { a: 1 },
        strategy: 'crdt',
        persist: true,
      });
    }).toThrow(/only supported for the "lww" strategy/);

    const persistedBinding: SharedStateBinding = {
      key: 'doc',
      strategy: 'lww',
      initialValue: { a: 1 },
      persist: true,
    };
    expect(() => {
      assertCompatibleSharedStateBinding(persistedBinding, 'doc', { initialValue: { a: 1 } });
    }).toThrow(/persistence is already enabled for this room/);
  });
});
