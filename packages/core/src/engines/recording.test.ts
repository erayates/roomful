import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoomTransportSignal } from '../transports/transport';
import type { RecordingEngine } from '../types';
import { createRecordingEngine, RECORDING_FORMAT_VERSION } from './recording';

function eventSignal(name: string): RoomTransportSignal {
  return {
    type: 'event',
    roomId: 'room-rec',
    fromPeerId: 'peer-a',
    timestamp: 0,
    payload: { name, payload: { value: name } },
  };
}

describe('createRecordingEngine', () => {
  let clock: number;
  const engineWithClock = (): RecordingEngine =>
    createRecordingEngine({ roomId: 'room-rec', peerId: 'peer-a', now: () => clock });

  beforeEach(() => {
    clock = 1_000;
  });

  it('ignores ingest until start() and after stop()', () => {
    const engine = engineWithClock();
    engine.ingest('inbound', eventSignal('before'));
    expect(engine.getState().frameCount).toBe(0);

    engine.start();
    clock = 1_050;
    engine.ingest('inbound', eventSignal('during'));
    engine.stop();
    engine.ingest('outbound', eventSignal('after'));

    expect(engine.getFrames()).toHaveLength(1);
    expect(engine.getState().isRecording).toBe(false);
  });

  it('captures frames with relative timestamps and direction', () => {
    const engine = engineWithClock();
    engine.start(); // startedAt = 1000
    clock = 1_200;
    engine.ingest('inbound', eventSignal('a'));
    clock = 1_500;
    engine.ingest('outbound', eventSignal('b'));

    const frames = engine.getFrames();
    expect(frames).toEqual([
      { t: 200, direction: 'inbound', signal: expect.objectContaining({ type: 'event' }) },
      { t: 500, direction: 'outbound', signal: expect.objectContaining({ type: 'event' }) },
    ]);
    expect(engine.getState()).toEqual({ isRecording: true, frameCount: 2, durationMs: 500 });
  });

  it('clones signals so later mutation cannot corrupt a captured frame', () => {
    const engine = engineWithClock();
    const signal = eventSignal('original');
    engine.start();
    engine.ingest('inbound', signal);
    if (signal.type === 'event') {
      signal.payload.name = 'mutated';
    }

    const frame = engine.getFrames()[0];
    expect(frame?.signal).not.toBe(signal);
    expect(frame?.signal.type).toBe('event');
    if (frame?.signal.type === 'event') {
      expect(frame.signal.payload.name).toBe('original');
    }
  });

  it('preserves binary crdt:sync payloads through capture and export', () => {
    const engine = engineWithClock();
    const signal: RoomTransportSignal = {
      type: 'crdt:sync',
      roomId: 'room-rec',
      fromPeerId: 'peer-a',
      timestamp: 0,
      payload: { kind: 'update', data: new Uint8Array([4, 8, 15, 16]) },
    };
    engine.start();
    engine.ingest('inbound', signal);

    const exported = engine.export();
    const frame = exported.frames[0];
    expect(frame?.signal.type).toBe('crdt:sync');
    if (frame?.signal.type === 'crdt:sync') {
      const { data } = frame.signal.payload;
      expect(data).toBeInstanceOf(Uint8Array);
      expect(Array.from(data)).toEqual([4, 8, 15, 16]);
    }
  });

  it('exports a versioned, self-describing recording', () => {
    const engine = engineWithClock();
    engine.start();
    clock = 1_300;
    engine.ingest('inbound', eventSignal('x'));

    const exported = engine.export();
    expect(exported).toMatchObject({
      version: RECORDING_FORMAT_VERSION,
      roomId: 'room-rec',
      peerId: 'peer-a',
      startedAt: 1_000,
      durationMs: 300,
    });
    expect(exported.frames).toHaveLength(1);
  });

  it('notifies subscribers on start, each captured frame, and stop', () => {
    const engine = engineWithClock();
    const frameCounts: number[] = [];
    engine.subscribe((state) => frameCounts.push(state.frameCount));
    engine.start();
    engine.ingest('inbound', eventSignal('a'));
    engine.stop();
    // immediate (0), start (0), ingest (1), stop (1)
    expect(frameCounts).toEqual([0, 0, 1, 1]);
  });

  describe('replay()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('re-emits frames at their original tempo, then ends', () => {
      const engine = createRecordingEngine({
        roomId: 'room-rec',
        peerId: 'peer-a',
        now: () => clock,
      });
      engine.start(); // startedAt = 1000
      clock = 1_200;
      engine.ingest('inbound', eventSignal('a')); // t = 200
      clock = 1_700;
      engine.ingest('outbound', eventSignal('b')); // t = 700

      const session = engine.replay();
      const seen: Array<{ cursor: number; playing: boolean; hasFrame: boolean }> = [];
      session.subscribe((event) => {
        seen.push({
          cursor: event.cursor,
          playing: event.isPlaying,
          hasFrame: event.frame !== null,
        });
      });

      session.play();
      expect(seen.filter((entry) => entry.hasFrame)).toHaveLength(0); // nothing emitted yet
      vi.advanceTimersByTime(200);
      expect(seen.filter((entry) => entry.hasFrame)).toHaveLength(1); // first frame
      vi.advanceTimersByTime(500);

      expect(seen.filter((entry) => entry.hasFrame)).toHaveLength(2); // second frame
      expect(seen.at(-1)).toEqual({ cursor: 2, playing: false, hasFrame: false }); // ended
    });
  });
});
