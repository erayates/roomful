import { z } from 'zod';

// ── Project ───────────────────────────────────────────────────────────────────

/**
 * A project groups rooms together and carries a quota. Owned by an account;
 * every newly created project starts with the relay-wide default limits
 * clamped by any account-level quota.
 */
export interface Project {
  /** Unique project id across the relay. */
  id: string;

  /** Human-readable project name (required, but can be the same as the id). */
  name: string;

  /** Free-form description. */
  description: string | undefined;

  /** Opaque metadata the owner can attach. */
  metadata: Record<string, unknown> | undefined;

  /** Epoch milliseconds when the project was created. */
  createdAt: number;

  /** Epoch milliseconds when the project was last updated. */
  updatedAt: number;

  /**
   * The account that owns the project. A relay must provide this claim
   * (via the JWT `sub` or a custom field) during authorization.
   */
  ownerId: string;
}

export const projectSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  ownerId: z.string().min(1).max(128),
});

export const createProjectInputSchema = z.object({
  /** Optional id; auto-generated when omitted. Must be unique. */
  id: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  metadata: z.record(z.unknown()).optional(),
  ownerId: z.string().min(1).max(128),
});

export const updateProjectInputSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2048).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

// ── Room ──────────────────────────────────────────────────────────────────────

/**
 * A room record is the management-plane representation of a room.
 */
export interface RoomRecord {
  /** Unique room id across the relay (the same id peers use to join). */
  id: string;

  /** The project this room belongs to. */
  projectId: string;

  /** Human-readable label. */
  name: string | undefined;

  /** Opaque metadata the owner can attach. */
  metadata: Record<string, unknown> | undefined;

  /** When the room was provisioned (epoch ms). */
  createdAt: number;

  /** When `true` the room is never persisted and disconnects after `ttlMs`;
   * matches the core SDK `ephemeral` option. */
  ephemeral: boolean;

  /** Auto-disconnect TTL in ms (`0` = no TTL, meaningful only with `ephemeral`). */
  ttlMs: number;
}

export const roomRecordSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128),
  name: z.string().max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.number().finite(),
  ephemeral: z.boolean(),
  ttlMs: z.number().int().min(0),
});

export const createRoomInputSchema = z.object({
  /** Optional id; auto-generated when omitted. */
  id: z.string().min(1).max(128).optional(),
  name: z.string().max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
  ephemeral: z.boolean().optional(),
  ttlMs: z.number().int().min(0).optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;

// ── Quota ─────────────────────────────────────────────────────────────────────

/**
 * Per-project resource limits. A project that has no explicit quota inherits
 * the relay-wide defaults (which may themselves be unlimited).
 *
 * A value of `-1` means *unlimited*; `undefined` inherits the relay default.
 */
export interface ProjectQuota {
  /** The project this quota applies to. */
  projectId: string;

  /** Hard cap on distinct rooms within the project. `-1` = unlimited. */
  maxRooms: number | undefined;

  /** Hard cap on concurrent peers *per room*. `-1` = unlimited. */
  maxPeersPerRoom: number | undefined;

  /** Hard cap on concurrent peers across all project rooms. `-1` = unlimited. */
  maxTotalPeers: number | undefined;

  /** Per-peer message rate limit (messages per `messageRateIntervalMs`). */
  messageRateLimit: number | undefined;

  /** Refill window for `messageRateLimit` in milliseconds. */
  messageRateIntervalMs: number | undefined;

  /** Maximum TTL in ms for ephemeral rooms (`-1` = unlimited). */
  maxEphemeralTtlMs: number | undefined;

  /** Maximum combined state size in bytes across all rooms (`-1` = unlimited). */
  maxTotalStateBytes: number | undefined;

  /** Epoch milliseconds when the project's quota was last adjusted. */
  updatedAt: number;
}

export const projectQuotaSchema = z.object({
  projectId: z.string().min(1).max(128),
  maxRooms: z.number().int().min(-1).optional(),
  maxPeersPerRoom: z.number().int().min(-1).optional(),
  maxTotalPeers: z.number().int().min(-1).optional(),
  messageRateLimit: z.number().int().min(-1).optional(),
  messageRateIntervalMs: z.number().int().min(-1).optional(),
  maxEphemeralTtlMs: z.number().int().min(-1).optional(),
  maxTotalStateBytes: z.number().int().min(-1).optional(),
  updatedAt: z.number().finite(),
});

export const updateQuotaInputSchema = z.object({
  maxRooms: z.number().int().min(-1).optional(),
  maxPeersPerRoom: z.number().int().min(-1).optional(),
  maxTotalPeers: z.number().int().min(-1).optional(),
  messageRateLimit: z.number().int().min(-1).optional(),
  messageRateIntervalMs: z.number().int().min(-1).optional(),
  maxEphemeralTtlMs: z.number().int().min(-1).optional(),
  maxTotalStateBytes: z.number().int().min(-1).optional(),
});

export type UpdateQuotaInput = z.infer<typeof updateQuotaInputSchema>;

// ── Usage (read-only snapshot) ────────────────────────────────────────────────

/**
 * Point-in-time usage snapshot for a project. Read-only; refreshed on demand.
 */
export interface ProjectUsage {
  /** The project this usage snapshot is for. */
  projectId: string;

  /** How many rooms currently exist in the project. */
  roomCount: number;

  /** How many peers are connected across all rooms in the project. */
  totalPeerCount: number;

  /** Sum of approximate state bytes across all non-ephemeral rooms. */
  totalStateBytes: number;

  /** Epoch milliseconds when this snapshot was taken. */
  sampledAt: number;
}

export const projectUsageSchema = z.object({
  projectId: z.string().min(1).max(128),
  roomCount: z.number().int().min(0),
  totalPeerCount: z.number().int().min(0),
  totalStateBytes: z.number().int().min(0),
  sampledAt: z.number().finite(),
});

// ── Usage events ─────────────────────────────────────────────────────────────

/** Supported usage event types. */
export type UsageEventType =
  | 'room.minute'
  | 'peer.connection'
  | 'message.sent'
  | 'storage.byte'
  | 'recording.minute'
  | 'ai.action';

/** A single usage event recorded by the relay. */
export interface UsageEvent {
  id: string;
  projectId: string;
  roomId: string;
  eventType: UsageEventType;
  quantity: number;
  unit: string;
  metadata: Record<string, unknown>;
  recordedAt: number;
}

/** Usage query parameters. */
export interface UsageQuery {
  projectId: string;
  from: number;
  to: number;
  eventTypes?: UsageEventType[];
}

/** Aggregated usage totals for a time window. */
export interface UsageAggregation {
  projectId: string;
  windowStart: string;
  windowEnd: string;
  totals: Record<UsageEventType, number>;
}

export const usageEventSchema = z.object({
  id: z.string().min(1).max(128),
  projectId: z.string().min(1).max(128),
  roomId: z.string().min(1).max(128),
  eventType: z.enum(['room.minute', 'peer.connection', 'message.sent', 'storage.byte', 'recording.minute', 'ai.action']),
  quantity: z.number().min(0),
  unit: z.string().min(1).max(64),
  metadata: z.record(z.unknown()),
  recordedAt: z.number().finite(),
});

export const recordUsageEventInputSchema = z.object({
  roomId: z.string().min(1).max(128),
  eventType: z.enum(['room.minute', 'peer.connection', 'message.sent', 'storage.byte', 'recording.minute', 'ai.action']),
  quantity: z.number().min(0),
  unit: z.string().min(1).max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type RecordUsageEventInput = z.infer<typeof recordUsageEventInputSchema>;

export const usageQuerySchema = z.object({
  projectId: z.string().min(1).max(128),
  from: z.number().finite(),
  to: z.number().finite(),
  eventTypes: z.array(z.enum(['room.minute', 'peer.connection', 'message.sent', 'storage.byte', 'recording.minute', 'ai.action'])).optional(),
});

// ── Relay defaults ────────────────────────────────────────────────────────────

/**
 * Relay-wide default limits applied to every project that has no explicit
 * {@link ProjectQuota} override.
 */
export interface RelayDefaults {
  /** Default room cap per project (`-1` = unlimited). */
  maxRooms: number;
  maxPeersPerRoom: number;
  maxTotalPeers: number;
  messageRateLimit: number;
  messageRateIntervalMs: number;
  maxEphemeralTtlMs: number;
  maxTotalStateBytes: number;
}

export const relayDefaultsSchema = z.object({
  maxRooms: z.number().int().min(-1),
  maxPeersPerRoom: z.number().int().min(-1),
  maxTotalPeers: z.number().int().min(-1),
  messageRateLimit: z.number().int().min(-1),
  messageRateIntervalMs: z.number().int().min(-1),
  maxEphemeralTtlMs: z.number().int().min(-1),
  maxTotalStateBytes: z.number().int().min(-1),
});

/**
 * Resolves the effective quota for a project by merging the project-specific
 * quota with relay defaults. A `-1` value means *unlimited*; `undefined`
 * falls back to the relay default.
 */
export function resolveEffectiveQuota(
  projectQuota: ProjectQuota | undefined,
  defaults: RelayDefaults,
): ProjectQuota {
  const now = Date.now();
  return {
    projectId: projectQuota?.projectId ?? '',
    maxRooms: projectQuota?.maxRooms === undefined ? defaults.maxRooms : projectQuota.maxRooms,
    maxPeersPerRoom:
      projectQuota?.maxPeersPerRoom === undefined
        ? defaults.maxPeersPerRoom
        : projectQuota.maxPeersPerRoom,
    maxTotalPeers:
      projectQuota?.maxTotalPeers === undefined
        ? defaults.maxTotalPeers
        : projectQuota.maxTotalPeers,
    messageRateLimit:
      projectQuota?.messageRateLimit === undefined
        ? defaults.messageRateLimit
        : projectQuota.messageRateLimit,
    messageRateIntervalMs:
      projectQuota?.messageRateIntervalMs === undefined
        ? defaults.messageRateIntervalMs
        : projectQuota.messageRateIntervalMs,
    maxEphemeralTtlMs:
      projectQuota?.maxEphemeralTtlMs === undefined
        ? defaults.maxEphemeralTtlMs
        : projectQuota.maxEphemeralTtlMs,
    maxTotalStateBytes:
      projectQuota?.maxTotalStateBytes === undefined
        ? defaults.maxTotalStateBytes
        : projectQuota.maxTotalStateBytes,
    updatedAt: projectQuota?.updatedAt ?? now,
  };
}
