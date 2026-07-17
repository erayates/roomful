import { describe, expect, it } from 'vitest';

import {
  createProjectInputSchema,
  createRoomInputSchema,
  projectQuotaSchema,
  projectSchema,
  projectUsageSchema,
  relayDefaultsSchema,
  resolveEffectiveQuota,
  roomRecordSchema,
  updateProjectInputSchema,
  updateQuotaInputSchema,
} from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const NOW = 1_750_000_000_000;

/* eslint-disable @typescript-eslint/explicit-function-return-type */

function validProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test project',
    metadata: { env: 'staging' },
    createdAt: NOW,
    updatedAt: NOW,
    ownerId: 'acct-42',
    ...overrides,
  };
}

function validRoomRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'room-1',
    projectId: 'proj-1',
    name: 'Main Lobby',
    metadata: { region: 'eu-west' },
    createdAt: NOW,
    ephemeral: false,
    ttlMs: 0,
    ...overrides,
  };
}

function validProjectQuota(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectId: 'proj-1',
    maxRooms: 50,
    maxPeersPerRoom: 200,
    maxTotalPeers: 1_000,
    messageRateLimit: 10,
    messageRateIntervalMs: 1_000,
    maxEphemeralTtlMs: 86_400_000,
    maxTotalStateBytes: 10_485_760,
    updatedAt: NOW,
    ...overrides,
  };
}

function validProjectUsage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectId: 'proj-1',
    roomCount: 12,
    totalPeerCount: 340,
    totalStateBytes: 2_097_152,
    sampledAt: NOW,
    ...overrides,
  };
}

function validRelayDefaults(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    maxRooms: 100,
    maxPeersPerRoom: 250,
    maxTotalPeers: 10_000,
    messageRateLimit: 20,
    messageRateIntervalMs: 1_000,
    maxEphemeralTtlMs: 86_400_000,
    maxTotalStateBytes: 104_857_600,
    ...overrides,
  };
}

// ── projectSchema ──────────────────────────────────────────────────────────────

describe('projectSchema', () => {
  it('parses a valid project', () => {
    const parsed = projectSchema.parse(validProject());
    expect(parsed).toEqual(validProject());
  });

  it('rejects an empty id', () => {
    expect(() => projectSchema.parse(validProject({ id: '' }))).toThrow();
  });

  it('rejects an id longer than 128 characters', () => {
    expect(() => projectSchema.parse(validProject({ id: 'a'.repeat(129) }))).toThrow();
  });

  it('accepts an id exactly 128 characters', () => {
    const parsed = projectSchema.parse(validProject({ id: 'a'.repeat(128) }));
    expect(parsed.id).toBe('a'.repeat(128));
  });

  it('rejects an empty name', () => {
    expect(() => projectSchema.parse(validProject({ name: '' }))).toThrow();
  });

  it('rejects a name longer than 256 characters', () => {
    expect(() => projectSchema.parse(validProject({ name: 'a'.repeat(257) }))).toThrow();
  });

  it('rejects a description longer than 2048 characters', () => {
    expect(() =>
      projectSchema.parse(validProject({ description: 'a'.repeat(2049) })),
    ).toThrow();
  });

  it('accepts undefined description', () => {
    const parsed = projectSchema.parse(validProject({ description: undefined }));
    expect(parsed.description).toBeUndefined();
  });

  it('accepts undefined metadata', () => {
    const parsed = projectSchema.parse(validProject({ metadata: undefined }));
    expect(parsed.metadata).toBeUndefined();
  });

  it('rejects non-finite createdAt', () => {
    expect(() => projectSchema.parse(validProject({ createdAt: Infinity }))).toThrow();
  });

  it('rejects non-finite updatedAt', () => {
    expect(() => projectSchema.parse(validProject({ updatedAt: NaN }))).toThrow();
  });

  it('rejects an empty ownerId', () => {
    expect(() => projectSchema.parse(validProject({ ownerId: '' }))).toThrow();
  });
});

// ── createProjectInputSchema ───────────────────────────────────────────────────

describe('createProjectInputSchema', () => {
  it('parses a minimal input (id omitted)', () => {
    const parsed = createProjectInputSchema.parse({
      name: 'Minimal',
      ownerId: 'acct-1',
    });
    expect(parsed).toEqual({ name: 'Minimal', ownerId: 'acct-1' });
  });

  it('parses a full input with optional id', () => {
    const parsed = createProjectInputSchema.parse({
      id: 'my-project',
      name: 'Full Project',
      description: 'desc',
      metadata: { key: 'val' },
      ownerId: 'acct-1',
    });
    expect(parsed).toEqual({
      id: 'my-project',
      name: 'Full Project',
      description: 'desc',
      metadata: { key: 'val' },
      ownerId: 'acct-1',
    });
  });

  it('rejects missing name', () => {
    expect(() =>
      createProjectInputSchema.parse({ ownerId: 'acct-1' }),
    ).toThrow();
  });

  it('rejects missing ownerId', () => {
    expect(() =>
      createProjectInputSchema.parse({ name: 'Proj' }),
    ).toThrow();
  });

  it('rejects an id longer than 128 characters', () => {
    expect(() =>
      createProjectInputSchema.parse({
        id: 'a'.repeat(129),
        name: 'Proj',
        ownerId: 'acct-1',
      }),
    ).toThrow();
  });
});

// ── updateProjectInputSchema ───────────────────────────────────────────────────

describe('updateProjectInputSchema', () => {
  it('parses a full update', () => {
    const parsed = updateProjectInputSchema.parse({
      name: 'Renamed',
      description: 'New desc',
      metadata: { version: 2 },
    });
    expect(parsed).toEqual({ name: 'Renamed', description: 'New desc', metadata: { version: 2 } });
  });

  it('accepts an empty object (all fields optional)', () => {
    const parsed = updateProjectInputSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('accepts a partial update (name only)', () => {
    const parsed = updateProjectInputSchema.parse({ name: 'Just Name' });
    expect(parsed).toEqual({ name: 'Just Name' });
  });
});

// ── roomRecordSchema ───────────────────────────────────────────────────────────

describe('roomRecordSchema', () => {
  it('parses a valid room record', () => {
    const parsed = roomRecordSchema.parse(validRoomRecord());
    expect(parsed).toEqual(validRoomRecord());
  });

  it('rejects an empty id', () => {
    expect(() => roomRecordSchema.parse(validRoomRecord({ id: '' }))).toThrow();
  });

  it('rejects an empty projectId', () => {
    expect(() => roomRecordSchema.parse(validRoomRecord({ projectId: '' }))).toThrow();
  });

  it('accepts undefined name', () => {
    const parsed = roomRecordSchema.parse(validRoomRecord({ name: undefined }));
    expect(parsed.name).toBeUndefined();
  });

  it('rejects a name longer than 256 characters', () => {
    expect(() =>
      roomRecordSchema.parse(validRoomRecord({ name: 'a'.repeat(257) })),
    ).toThrow();
  });

  it('rejects a non-boolean ephemeral', () => {
    expect(() => roomRecordSchema.parse(validRoomRecord({ ephemeral: 'yes' }))).toThrow();
  });

  it('rejects negative ttlMs', () => {
    expect(() => roomRecordSchema.parse(validRoomRecord({ ttlMs: -1 }))).toThrow();
  });

  it('accepts ttlMs of 0 (no TTL)', () => {
    const parsed = roomRecordSchema.parse(validRoomRecord({ ttlMs: 0 }));
    expect(parsed.ttlMs).toBe(0);
  });

  it('accepts a large ttlMs', () => {
    const parsed = roomRecordSchema.parse(validRoomRecord({ ttlMs: 86_400_000 }));
    expect(parsed.ttlMs).toBe(86_400_000);
  });
});

// ── createRoomInputSchema ──────────────────────────────────────────────────────

describe('createRoomInputSchema', () => {
  it('parses an empty input (all fields optional)', () => {
    const parsed = createRoomInputSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('parses a full input with all fields', () => {
    const parsed = createRoomInputSchema.parse({
      id: 'room-x',
      name: 'Lobby',
      metadata: { capacity: 50 },
      ephemeral: true,
      ttlMs: 3_600_000,
    });
    expect(parsed).toEqual({
      id: 'room-x',
      name: 'Lobby',
      metadata: { capacity: 50 },
      ephemeral: true,
      ttlMs: 3_600_000,
    });
  });

  it('rejects negative ttlMs', () => {
    expect(() => createRoomInputSchema.parse({ ttlMs: -1 })).toThrow();
  });

  it('rejects non-integer ttlMs', () => {
    expect(() => createRoomInputSchema.parse({ ttlMs: 1.5 })).toThrow();
  });
});

// ── projectQuotaSchema ─────────────────────────────────────────────────────────

describe('projectQuotaSchema', () => {
  it('parses a valid quota', () => {
    const parsed = projectQuotaSchema.parse(validProjectQuota());
    expect(parsed).toEqual(validProjectQuota());
  });

  it('accepts -1 for unlimited fields', () => {
    const parsed = projectQuotaSchema.parse(
      validProjectQuota({
        maxRooms: -1,
        maxPeersPerRoom: -1,
        maxTotalPeers: -1,
        messageRateLimit: -1,
        messageRateIntervalMs: -1,
        maxEphemeralTtlMs: -1,
        maxTotalStateBytes: -1,
      }),
    );
    expect(parsed.maxRooms).toBe(-1);
    expect(parsed.maxPeersPerRoom).toBe(-1);
  });

  it('accepts undefined optional fields', () => {
    const parsed = projectQuotaSchema.parse({ projectId: 'p1', updatedAt: NOW });
    expect(parsed.maxRooms).toBeUndefined();
    expect(parsed.maxPeersPerRoom).toBeUndefined();
  });

  it('rejects missing projectId', () => {
    expect(() => projectQuotaSchema.parse({ updatedAt: NOW })).toThrow();
  });

  it('rejects missing updatedAt', () => {
    expect(() => projectQuotaSchema.parse({ projectId: 'p1' })).toThrow();
  });

  it('rejects values below -1', () => {
    expect(() => projectQuotaSchema.parse(validProjectQuota({ maxRooms: -2 }))).toThrow();
    expect(() => projectQuotaSchema.parse(validProjectQuota({ maxTotalPeers: -3 }))).toThrow();
  });

  it('rejects non-integer values', () => {
    expect(() => projectQuotaSchema.parse(validProjectQuota({ maxRooms: 5.5 }))).toThrow();
  });
});

// ── updateQuotaInputSchema ─────────────────────────────────────────────────────

describe('updateQuotaInputSchema', () => {
  it('parses a full update', () => {
    const parsed = updateQuotaInputSchema.parse({
      maxRooms: 100,
      maxPeersPerRoom: 50,
      maxTotalPeers: 5_000,
      messageRateLimit: 30,
      messageRateIntervalMs: 2_000,
      maxEphemeralTtlMs: 43_200_000,
      maxTotalStateBytes: 52_428_800,
    });
    expect(parsed.maxRooms).toBe(100);
    expect(parsed.maxPeersPerRoom).toBe(50);
  });

  it('accepts an empty object', () => {
    const parsed = updateQuotaInputSchema.parse({});
    expect(parsed).toEqual({});
  });

  it('accepts partial update (single field)', () => {
    const parsed = updateQuotaInputSchema.parse({ maxRooms: 200 });
    expect(parsed).toEqual({ maxRooms: 200 });
  });

  it('rejects values below -1', () => {
    expect(() => updateQuotaInputSchema.parse({ maxRooms: -2 })).toThrow();
  });
});

// ── projectUsageSchema ─────────────────────────────────────────────────────────

describe('projectUsageSchema', () => {
  it('parses valid usage data', () => {
    const parsed = projectUsageSchema.parse(validProjectUsage());
    expect(parsed).toEqual(validProjectUsage());
  });

  it('rejects negative roomCount', () => {
    expect(() => projectUsageSchema.parse(validProjectUsage({ roomCount: -1 }))).toThrow();
  });

  it('rejects negative totalPeerCount', () => {
    expect(() => projectUsageSchema.parse(validProjectUsage({ totalPeerCount: -1 }))).toThrow();
  });

  it('rejects negative totalStateBytes', () => {
    expect(() => projectUsageSchema.parse(validProjectUsage({ totalStateBytes: -1 }))).toThrow();
  });

  it('rejects non-integer roomCount', () => {
    expect(() => projectUsageSchema.parse(validProjectUsage({ roomCount: 5.5 }))).toThrow();
  });

  it('rejects non-finite sampledAt', () => {
    expect(() => projectUsageSchema.parse(validProjectUsage({ sampledAt: Infinity }))).toThrow();
  });
});

// ── relayDefaultsSchema ────────────────────────────────────────────────────────

describe('relayDefaultsSchema', () => {
  it('parses valid defaults', () => {
    const parsed = relayDefaultsSchema.parse(validRelayDefaults());
    expect(parsed).toEqual(validRelayDefaults());
  });

  it('accepts -1 for unlimited on all fields', () => {
    const parsed = relayDefaultsSchema.parse({
      maxRooms: -1,
      maxPeersPerRoom: -1,
      maxTotalPeers: -1,
      messageRateLimit: -1,
      messageRateIntervalMs: -1,
      maxEphemeralTtlMs: -1,
      maxTotalStateBytes: -1,
    });
    expect(parsed.maxRooms).toBe(-1);
    expect(parsed.maxTotalStateBytes).toBe(-1);
  });

  it('accepts zero for all fields', () => {
    const parsed = relayDefaultsSchema.parse({
      maxRooms: 0,
      maxPeersPerRoom: 0,
      maxTotalPeers: 0,
      messageRateLimit: 0,
      messageRateIntervalMs: 0,
      maxEphemeralTtlMs: 0,
      maxTotalStateBytes: 0,
    });
    expect(parsed.maxRooms).toBe(0);
    expect(parsed.maxTotalStateBytes).toBe(0);
  });

  it('rejects missing fields', () => {
    expect(() => relayDefaultsSchema.parse({ maxRooms: 10 })).toThrow();
  });

  it('rejects values below -1', () => {
    expect(() => relayDefaultsSchema.parse(validRelayDefaults({ maxRooms: -2 }))).toThrow();
    expect(() =>
      relayDefaultsSchema.parse(validRelayDefaults({ maxTotalPeers: -5 })),
    ).toThrow();
  });

  it('rejects non-integer values', () => {
    expect(() => relayDefaultsSchema.parse(validRelayDefaults({ maxRooms: 10.1 }))).toThrow();
  });
});

// ── resolveEffectiveQuota ──────────────────────────────────────────────────────

describe('resolveEffectiveQuota', () => {
  function defaults(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      maxRooms: 100,
      maxPeersPerRoom: 250,
      maxTotalPeers: 10_000,
      messageRateLimit: 20,
      messageRateIntervalMs: 1_000,
      maxEphemeralTtlMs: 86_400_000,
      maxTotalStateBytes: 104_857_600,
      ...overrides,
    };
  }

  function quota(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      projectId: 'proj-1',
      maxRooms: 50,
      maxPeersPerRoom: 200,
      maxTotalPeers: 1_000,
      messageRateLimit: 10,
      messageRateIntervalMs: 2_000,
      maxEphemeralTtlMs: 43_200_000,
      maxTotalStateBytes: 10_485_760,
      updatedAt: NOW,
      ...overrides,
    };
  }

  it('returns project quota values when all are explicitly set', () => {
    const result = resolveEffectiveQuota(quota(), defaults());
    expect(result.projectId).toBe('proj-1');
    expect(result.maxRooms).toBe(50);
    expect(result.maxPeersPerRoom).toBe(200);
    expect(result.maxTotalPeers).toBe(1_000);
    expect(result.messageRateLimit).toBe(10);
    expect(result.messageRateIntervalMs).toBe(2_000);
    expect(result.maxEphemeralTtlMs).toBe(43_200_000);
    expect(result.maxTotalStateBytes).toBe(10_485_760);
    expect(result.updatedAt).toBe(NOW);
  });

  it('falls back to defaults for undefined quota fields', () => {
    const partial = quota({
      maxRooms: undefined,
      maxPeersPerRoom: undefined,
      maxTotalPeers: undefined,
    });
    const result = resolveEffectiveQuota(partial, defaults());
    expect(result.maxRooms).toBe(100);
    expect(result.maxPeersPerRoom).toBe(250);
    expect(result.maxTotalPeers).toBe(10_000);
    // Explicitly set fields still come from the quota
    expect(result.messageRateLimit).toBe(10);
  });

  it('falls back entirely to defaults when quota is undefined', () => {
    const result = resolveEffectiveQuota(undefined, defaults());
    expect(result.projectId).toBe('');
    expect(result.maxRooms).toBe(100);
    expect(result.maxPeersPerRoom).toBe(250);
    expect(result.maxTotalPeers).toBe(10_000);
    expect(result.messageRateLimit).toBe(20);
    expect(result.messageRateIntervalMs).toBe(1_000);
    expect(result.maxEphemeralTtlMs).toBe(86_400_000);
    expect(result.maxTotalStateBytes).toBe(104_857_600);
  });

  it('preserves -1 (unlimited) from quota over defaults', () => {
    const result = resolveEffectiveQuota(quota({ maxRooms: -1 }), defaults());
    expect(result.maxRooms).toBe(-1);
  });

  it('preserves -1 (unlimited) from defaults when quota field is undefined', () => {
    const d = defaults({ maxRooms: -1 });
    const q = quota({ maxRooms: undefined });
    const result = resolveEffectiveQuota(q, d);
    expect(result.maxRooms).toBe(-1);
  });

  it('uses Date.now() for updatedAt when quota is undefined', () => {
    const before = Date.now();
    const result = resolveEffectiveQuota(undefined, defaults());
    const after = Date.now();
    expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result.updatedAt).toBeLessThanOrEqual(after);
  });

  it('uses Date.now() for updatedAt when quota has no updatedAt', () => {
    const q = { projectId: 'p1', updatedAt: undefined as unknown as number };
    const before = Date.now();
     
    const result = resolveEffectiveQuota(q as any, defaults());
    const after = Date.now();
    expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result.updatedAt).toBeLessThanOrEqual(after);
  });

  it('merges a mix of set and unset fields correctly', () => {
    const partialProjectQuota = quota({
      maxRooms: 30,
      maxPeersPerRoom: undefined,
      maxTotalPeers: undefined,
      messageRateLimit: undefined,
      messageRateIntervalMs: 5_000,
    });
    const result = resolveEffectiveQuota(partialProjectQuota, defaults());
    expect(result.maxRooms).toBe(30);
    expect(result.maxPeersPerRoom).toBe(250);
    expect(result.maxTotalPeers).toBe(10_000);
    expect(result.messageRateLimit).toBe(20);
    expect(result.messageRateIntervalMs).toBe(5_000);
  });
});
