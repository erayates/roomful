import {
  getMillisecondsUntilNextUtcMidnight,
  getUtcRoomKey,
  readDemoRoomOverrides,
  resolveDemoRoomSelection,
} from './demo-room';

describe('demo-room', () => {
  it('creates a stable UTC room key', () => {
    expect(getUtcRoomKey(new Date('2026-03-11T22:15:45.000Z'))).toBe('2026-03-11');
  });

  it('sanitizes explicit room overrides', () => {
    expect(readDemoRoomOverrides(new URLSearchParams('room=  Demo Room !!  '))).toEqual({
      dayOverride: undefined,
      roomOverride: 'demo-room',
    });
  });

  it('uses a day override when provided', () => {
    expect(
      resolveDemoRoomSelection(
        readDemoRoomOverrides(new URLSearchParams('day=2026-03-18')),
        new Date('2026-03-11T12:00:00.000Z'),
      ),
    ).toEqual({
      roomId: 'demo-2026-03-18',
      roomKey: '2026-03-18',
    });
  });

  it('computes the delay until next UTC midnight', () => {
    expect(getMillisecondsUntilNextUtcMidnight(new Date('2026-03-11T23:59:59.000Z'))).toBe(1_000);
  });
});
