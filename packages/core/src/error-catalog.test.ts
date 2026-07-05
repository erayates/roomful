import { describe, expect, it } from 'vitest';

import { describeRoomfulError, ROOMFUL_ERROR_CATALOG } from './error-catalog';
import type { RoomfulErrorCode } from './roomful-error';

const ALL_CODES: RoomfulErrorCode[] = [
  'ROOM_FULL',
  'AUTH_FAILED',
  'NETWORK_ERROR',
  'ENCRYPTION_ERROR',
  'DECRYPTION_ERROR',
  'INVALID_STATE',
];

describe('error catalog', () => {
  it('has a complete, well-formed entry for every error code', () => {
    for (const code of ALL_CODES) {
      const entry = ROOMFUL_ERROR_CATALOG[code];
      expect(entry.code).toBe(code);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.remediation.length).toBeGreaterThan(0);
      expect(typeof entry.recoverable).toBe('boolean');
    }
  });

  it('describeRoomfulError returns the catalog entry for a code', () => {
    expect(describeRoomfulError('ROOM_FULL')).toBe(ROOMFUL_ERROR_CATALOG.ROOM_FULL);
    expect(describeRoomfulError('AUTH_FAILED').recoverable).toBe(false);
    expect(describeRoomfulError('NETWORK_ERROR').recoverable).toBe(true);
  });

  it('does not have entries for unknown codes', () => {
    expect(Object.keys(ROOMFUL_ERROR_CATALOG).sort()).toEqual([...ALL_CODES].sort());
  });
});
