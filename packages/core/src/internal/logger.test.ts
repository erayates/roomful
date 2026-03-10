import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStructuredLogger, resolveDebugOptions } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createStructuredLogger', () => {
  it('resolves debug: true to all categories', () => {
    expect(resolveDebugOptions(true)).toEqual({
      transport: true,
      state: true,
      presence: true,
      events: true,
      performance: true,
    });
  });

  it('gates categories independently', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      return undefined;
    });
    const logger = createStructuredLogger({
      roomId: 'room-gated',
      debug: {
        state: true,
      },
    });

    logger.info('transport', 'transport', 'Transport selected');
    logger.info('state', 'state', 'State engine configured');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith('[FlockJS] state: State engine configured', {
      category: 'state',
      component: 'state',
      message: 'State engine configured',
      roomId: 'room-gated',
      timestamp: expect.any(Number),
    });
  });

  it('emits structured payloads with the expected prefix', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      return undefined;
    });
    const logger = createStructuredLogger({
      roomId: 'room-protocol',
      debug: {
        transport: true,
      },
    });

    logger.warn('transport', 'transport:protocol', 'Malformed protocol frame rejected', {
      reason: 'Malformed peer transport message.',
      transport: 'webrtc',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[FlockJS] transport:protocol: Malformed protocol frame rejected',
      {
        category: 'transport',
        component: 'transport:protocol',
        message: 'Malformed protocol frame rejected',
        reason: 'Malformed peer transport message.',
        roomId: 'room-protocol',
        timestamp: expect.any(Number),
        transport: 'webrtc',
      },
    );
  });

  it('suppresses info in production while keeping warn and error', () => {
    vi.stubGlobal('process', {
      env: {
        NODE_ENV: 'production',
      },
    });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      return undefined;
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      return undefined;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      return undefined;
    });
    const logger = createStructuredLogger({
      roomId: 'room-production',
      debug: true,
    });

    logger.info('transport', 'transport', 'Transport connected');
    logger.warn('transport', 'transport:protocol', 'Malformed protocol frame rejected');
    logger.error('transport', 'transport', 'Room error emitted');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
