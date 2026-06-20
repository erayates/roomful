export function normalizeMaxPeers(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    return undefined;
  }

  return value;
}

/**
 * The default maximum number of peers in a WebRTC mesh room when no explicit
 * `maxPeers` is configured. WebRTC mesh performance degrades beyond roughly
 * this many peers, so it acts as a safe ceiling. Relay and broadcast transports
 * stay unlimited unless `maxPeers` is set.
 */
export const DEFAULT_WEBRTC_MAX_PEERS = 15;

/**
 * Resolves the maximum number of remote peers a WebRTC mesh transport may
 * connect to, applying {@link DEFAULT_WEBRTC_MAX_PEERS} when `maxPeers` is unset
 * or invalid.
 *
 * @param value - The configured `maxPeers` option, if any.
 * @returns The remote-peer connection ceiling (room capacity minus self).
 */
export function resolveWebRtcRemotePeerLimit(value: unknown): number {
  const maxPeers = normalizeMaxPeers(value) ?? DEFAULT_WEBRTC_MAX_PEERS;
  return Math.max(maxPeers - 1, 0);
}
