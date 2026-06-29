import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockRoomHarness, type MockRoomHarness } from '../../test-utils/mock-room';

let harness: MockRoomHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('RecordingEngine with mock transport', () => {
  it('captures inbound and outbound signals through the room taps', async () => {
    harness = await createMockRoomHarness();
    const roomA = harness.createRoom('engine-recording');
    const roomB = harness.createRoom('engine-recording');

    const recording = roomA.useRecording();
    recording.start();

    await Promise.all([roomA.connect(), roomB.connect()]);
    await harness.waitFor(() => roomA.peerCount === 1 && roomB.peerCount === 1);

    // Outbound tap: roomA's own emit is captured as it leaves the room.
    roomA.useEvents().emit('ping', { from: 'a' });
    // Inbound tap: roomB's emit is captured as roomA receives it.
    roomB.useEvents().emit('pong', { from: 'b' });

    await harness.waitFor(() =>
      recording
        .getFrames()
        .some((frame) => frame.direction === 'inbound' && frame.signal.type === 'event'),
    );

    const frames = recording.getFrames();
    expect(
      frames.some((frame) => frame.direction === 'outbound' && frame.signal.type === 'event'),
    ).toBe(true);
    expect(
      frames.some((frame) => frame.direction === 'inbound' && frame.signal.type === 'event'),
    ).toBe(true);

    // The exported recording carries the captured frames and the room identity.
    const exported = recording.export();
    expect(exported.roomId).toBe('engine-recording');
    expect(exported.frames).toHaveLength(frames.length);
  });
});
