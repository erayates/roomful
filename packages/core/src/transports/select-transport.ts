import { createCahootsError } from '../cahoots-error';
import { env } from '../internal/env';
import { createStructuredLogger } from '../internal/logger';
import type { CahootsError, PresenceData, RoomOptions } from '../types';
import { createBroadcastTransportAdapter, isBroadcastChannelAvailable } from './broadcast';
import { createInMemoryTransportAdapter } from './in-memory';
import type { TransportAdapter } from './transport';
import { createWebRTCFallbackTransportAdapter } from './webrtc-fallback';
import { createWebSocketTransportAdapter } from './websocket';

function hasRelayUrl<TPresence extends PresenceData>(options: RoomOptions<TPresence>): boolean {
  return typeof options.relayUrl === 'string' && options.relayUrl.trim().length > 0;
}

export function shouldSelectWebSocketTransport<TPresence extends PresenceData>(
  options: RoomOptions<TPresence>,
): boolean {
  const mode = options.transport ?? 'auto';
  if (mode === 'websocket') {
    return true;
  }

  if (mode !== 'auto') {
    return false;
  }

  if (isBroadcastChannelAvailable()) {
    return false;
  }

  if (env.hasRTCPeerConnection && hasRelayUrl(options)) {
    return false;
  }

  return hasRelayUrl(options);
}

function createWebRTCTransportError(error: unknown): CahootsError {
  return createCahootsError(
    'NETWORK_ERROR',
    error instanceof Error ? error.message : 'Failed to initialize WebRTC transport.',
    false,
    error,
  );
}

function logSelection<TPresence extends PresenceData>(
  roomId: string,
  options: RoomOptions<TPresence>,
  requestedMode: string,
  selectedTransport: TransportAdapter,
  reason: string,
): TransportAdapter {
  createStructuredLogger({
    roomId,
    debug: options.debug,
  }).info('transport', 'transport', 'Transport selected', {
    requestedMode,
    selectedTransport: selectedTransport.kind,
    reason,
  });

  return selectedTransport;
}

export function selectTransportAdapter<TPresence extends PresenceData>(
  roomId: string,
  peerId: string,
  options: RoomOptions<TPresence>,
): TransportAdapter {
  const mode = options.transport ?? 'auto';

  if (mode === 'broadcast') {
    if (isBroadcastChannelAvailable()) {
      return logSelection(
        roomId,
        options,
        mode,
        createBroadcastTransportAdapter(roomId, options.debug),
        'Explicit broadcast mode; BroadcastChannel available',
      );
    }

    return logSelection(
      roomId,
      options,
      mode,
      createInMemoryTransportAdapter(roomId, peerId),
      'Explicit broadcast mode; BroadcastChannel unavailable',
    );
  }

  if (mode === 'webrtc') {
    try {
      return logSelection(
        roomId,
        options,
        mode,
        createWebRTCFallbackTransportAdapter(roomId, peerId, options),
        'Explicit webrtc mode',
      );
    } catch (error) {
      throw createWebRTCTransportError(error);
    }
  }

  if (mode === 'websocket') {
    return logSelection(
      roomId,
      options,
      mode,
      createWebSocketTransportAdapter(roomId, peerId, options),
      'Explicit websocket mode',
    );
  }

  if (isBroadcastChannelAvailable()) {
    return logSelection(
      roomId,
      options,
      mode,
      createBroadcastTransportAdapter(roomId, options.debug),
      'BroadcastChannel available',
    );
  }

  if (env.hasRTCPeerConnection && hasRelayUrl(options)) {
    try {
      return logSelection(
        roomId,
        options,
        mode,
        createWebRTCFallbackTransportAdapter(roomId, peerId, options),
        'BroadcastChannel unavailable; RTCPeerConnection + relayUrl available',
      );
    } catch (error) {
      throw createWebRTCTransportError(error);
    }
  }

  if (hasRelayUrl(options)) {
    return logSelection(
      roomId,
      options,
      mode,
      createWebSocketTransportAdapter(roomId, peerId, options),
      'BroadcastChannel unavailable; WebRTC unavailable; relayUrl available',
    );
  }

  return logSelection(
    roomId,
    options,
    mode,
    createInMemoryTransportAdapter(roomId, peerId),
    'No browser-capable transport available',
  );
}
