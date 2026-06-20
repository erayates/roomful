import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEBRTC_MAX_PEERS,
  normalizeMaxPeers,
  resolveWebRtcRemotePeerLimit,
} from './max-peers';

describe('normalizeMaxPeers', () => {
  it('returns the value for valid positive integers', () => {
    expect(normalizeMaxPeers(8)).toBe(8);
    expect(normalizeMaxPeers(1)).toBe(1);
  });

  it('returns undefined for missing or invalid values', () => {
    expect(normalizeMaxPeers(undefined)).toBeUndefined();
    expect(normalizeMaxPeers(0)).toBeUndefined();
    expect(normalizeMaxPeers(-3)).toBeUndefined();
    expect(normalizeMaxPeers(2.5)).toBeUndefined();
    expect(normalizeMaxPeers(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(normalizeMaxPeers('5')).toBeUndefined();
  });
});

describe('resolveWebRtcRemotePeerLimit', () => {
  it('applies the WebRTC default when maxPeers is unset or invalid', () => {
    expect(DEFAULT_WEBRTC_MAX_PEERS).toBe(15);
    expect(resolveWebRtcRemotePeerLimit(undefined)).toBe(DEFAULT_WEBRTC_MAX_PEERS - 1);
    expect(resolveWebRtcRemotePeerLimit(0)).toBe(DEFAULT_WEBRTC_MAX_PEERS - 1);
    expect(resolveWebRtcRemotePeerLimit('nope')).toBe(DEFAULT_WEBRTC_MAX_PEERS - 1);
  });

  it('uses the configured maxPeers minus self when provided', () => {
    expect(resolveWebRtcRemotePeerLimit(2)).toBe(1);
    expect(resolveWebRtcRemotePeerLimit(10)).toBe(9);
    expect(resolveWebRtcRemotePeerLimit(1)).toBe(0);
  });
});
