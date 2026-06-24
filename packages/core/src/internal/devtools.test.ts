import { describe, expect, it } from 'vitest';

import { diffSerializedState, serializeDevtoolsValue } from './devtools';

describe('serializeDevtoolsValue', () => {
  it('serializes primitives and special scalar types', () => {
    expect(serializeDevtoolsValue(null)).toBeNull();
    expect(serializeDevtoolsValue('hello')).toBe('hello');
    expect(serializeDevtoolsValue(42)).toBe(42);
    expect(serializeDevtoolsValue(true)).toBe(true);
    expect(serializeDevtoolsValue(Number.POSITIVE_INFINITY)).toBe('[Number Infinity]');
    expect(serializeDevtoolsValue(Number.NaN)).toBe('[Number NaN]');
    expect(serializeDevtoolsValue(10n)).toBe('[BigInt]');
    expect(serializeDevtoolsValue(undefined)).toBe('[Undefined]');
  });

  it('labels symbols and functions', () => {
    function named(): number {
      return 1;
    }

    expect(serializeDevtoolsValue(Symbol('tag'))).toBe('[Symbol tag]');
    expect(serializeDevtoolsValue(Symbol(''))).toBe('[Symbol (anonymous)]');
    expect(serializeDevtoolsValue(named)).toBe('[Function named]');
    expect(serializeDevtoolsValue(() => undefined)).toBe('[Function anonymous]');
  });

  it('serializes valid and invalid dates', () => {
    expect(serializeDevtoolsValue(new Date('2020-01-01T00:00:00.000Z'))).toBe(
      '2020-01-01T00:00:00.000Z',
    );
    expect(serializeDevtoolsValue(new Date('not-a-date'))).toBe('[Invalid Date]');
  });

  it('serializes errors with message and name', () => {
    expect(serializeDevtoolsValue(new TypeError('boom'))).toMatchObject({
      message: 'boom',
      name: 'TypeError',
    });
  });

  it('serializes ArrayBuffer and typed arrays with a byte preview', () => {
    const view = new Uint8Array([1, 2, 3]);

    expect(serializeDevtoolsValue(view)).toEqual({
      __type: 'Uint8Array',
      length: 3,
      preview: [1, 2, 3],
    });
    expect(serializeDevtoolsValue(view.buffer)).toMatchObject({ __type: 'ArrayBuffer', length: 3 });
  });

  it('serializes nested arrays and objects with sorted keys', () => {
    expect(serializeDevtoolsValue([1, 'two', [3]])).toEqual([1, 'two', [3]]);
    expect(serializeDevtoolsValue({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
  });

  it('marks circular references', () => {
    const circular: Record<string, unknown> = { name: 'root' };
    circular.self = circular;

    expect(serializeDevtoolsValue(circular)).toEqual({ name: 'root', self: '[Circular]' });
  });

  it('caps deeply nested structures at the max depth', () => {
    let deep: unknown = 'leaf';
    for (let index = 0; index < 8; index += 1) {
      deep = { nested: deep };
    }

    expect(JSON.stringify(serializeDevtoolsValue(deep))).toContain('[MaxDepth]');
  });

  it('truncates long strings, arrays, and wide objects', () => {
    expect(serializeDevtoolsValue('a'.repeat(250))).toBe(
      `${'a'.repeat(200)}[Truncated: 50 more characters]`,
    );

    const longArray: number[] = [];
    for (let index = 0; index < 60; index += 1) {
      longArray.push(index);
    }
    expect(serializeDevtoolsValue(longArray)).toContain('[Truncated: 10 more items]');

    const wideObject: Record<string, number> = {};
    for (let index = 0; index < 60; index += 1) {
      wideObject[`key${String(index).padStart(2, '0')}`] = index;
    }
    expect(serializeDevtoolsValue(wideObject)).toMatchObject({
      __truncatedKeys: '[Truncated: 10 more keys]',
    });
  });
});

describe('diffSerializedState', () => {
  it('diffs added, removed, and changed leaf values', () => {
    expect(diffSerializedState({ a: 1, b: 2 }, { a: 9, c: 3 })).toEqual([
      { kind: 'changed', next: 9, path: 'a', previous: 1 },
      { kind: 'removed', next: null, path: 'b', previous: 2 },
      { kind: 'added', next: 3, path: 'c', previous: null },
    ]);
  });

  it('diffs nested record paths', () => {
    expect(diffSerializedState({ outer: { inner: 1 } }, { outer: { inner: 2 } })).toEqual([
      { kind: 'changed', next: 2, path: 'outer.inner', previous: 1 },
    ]);
  });

  it('emits no entries for equal values or root-level null transitions', () => {
    expect(diffSerializedState({ a: 1 }, { a: 1 })).toEqual([]);
    expect(diffSerializedState(null, { a: 1 })).toEqual([]);
    expect(diffSerializedState({ a: 1 }, null)).toEqual([]);
    expect(diffSerializedState(null, null)).toEqual([]);
  });

  it('respects the maxEntries cap', () => {
    const previous: Record<string, number> = {};
    const next: Record<string, number> = {};
    for (let index = 0; index < 10; index += 1) {
      previous[`k${String(index)}`] = index;
      next[`k${String(index)}`] = index + 100;
    }

    expect(diffSerializedState(previous, next, { maxEntries: 3 })).toHaveLength(3);
  });
});
