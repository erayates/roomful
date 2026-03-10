import { describe, expect, it } from 'vitest';

import { serializeDevtoolsValue } from './serialize';

describe('serializeDevtoolsValue', () => {
  it('serializes nested plain objects into JSON-safe values', () => {
    expect(
      serializeDevtoolsValue({
        active: true,
        nested: {
          label: 'room-a',
          value: 2,
        },
      }),
    ).toEqual({
      active: true,
      nested: {
        label: 'room-a',
        value: 2,
      },
    });
  });

  it('summarizes unsupported values without throwing', () => {
    const value = serializeDevtoolsValue({
      handler: () => {
        return undefined;
      },
      token: Symbol.for('demo'),
      bytes: Uint8Array.from([1, 2, 3, 4]),
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
    });

    expect(value).toEqual({
      bytes: {
        __type: 'Uint8Array',
        length: 4,
        preview: [1, 2, 3, 4],
      },
      createdAt: '2026-03-10T00:00:00.000Z',
      handler: '[Function handler]',
      token: '[Symbol demo]',
    });
  });

  it('marks circular references and truncates large branches', () => {
    const circular: Record<string, unknown> = {
      items: Array.from({ length: 5 }, (_, index) => {
        return `item-${index}`;
      }),
    };
    circular.self = circular;

    expect(
      serializeDevtoolsValue(circular, {
        maxArrayLength: 2,
        maxDepth: 2,
      }),
    ).toEqual({
      items: ['item-0', 'item-1', '[Truncated: 3 more items]'],
      self: '[Circular]',
    });
  });
});
