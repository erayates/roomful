/** Organization — top-level tenant in Roomful Cloud. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  updatedAt: string;
}

/** Project — contains rooms, owns API keys, has quotas. */
export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  quotaRooms: number;
  quotaPeersPerRoom: number;
  quotaMessagesPerMinute: number;
  quotaStorageMb: number;
  createdAt: string;
  updatedAt: string;
}

/** Quota tier presets. */
export const QUOTA_TIERS = {
  free: {
    rooms: 5,
    peersPerRoom: 25,
    messagesPerMinute: 500,
    storageMb: 50,
  },
  pro: {
    rooms: 50,
    peersPerRoom: 200,
    messagesPerMinute: 10_000,
    storageMb: 5_000,
  },
  enterprise: {
    rooms: Number.POSITIVE_INFINITY,
    peersPerRoom: Number.POSITIVE_INFINITY,
    messagesPerMinute: Number.POSITIVE_INFINITY,
    storageMb: Number.POSITIVE_INFINITY,
  },
} as const satisfies Record<string, ProjectQuota>;

export interface ProjectQuota {
  rooms: number;
  peersPerRoom: number;
  messagesPerMinute: number;
  storageMb: number;
}

/** API scope — what an API key can do. */
export type ApiKeyScope = 'rooms:read' | 'rooms:write' | 'admin';

/** API key — stored with hashed secret, never returned in plaintext after creation. */
export interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/** The full API key returned once on creation. */
export interface ApiKeyCreated {
  key: ApiKey;
  secret: string;
}

/** Create API key input. */
export interface CreateApiKeyInput {
  name: string;
  scopes?: ApiKeyScope[];
  expiresAt?: string;
}

/** Project create/update input. */
export interface CreateProjectInput {
  name: string;
  slug?: string;
  plan?: Organization['plan'];
}

export interface UpdateProjectInput {
  name?: string;
  quotaRooms?: number;
  quotaPeersPerRoom?: number;
  quotaMessagesPerMinute?: number;
  quotaStorageMb?: number;
}

// ── Room ──────────────────────────────────────────────────────────────────────

/** Room status — lifecycle state. */
export type RoomStatus = 'active' | 'paused' | 'closed';

/** Room — a real-time room inside a project. */
export interface Room {
  id: string;
  projectId: string;
  name: string;
  status: RoomStatus;
  maxPeers: number;
  peerCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CreateRoomInput {
  name: string;
  maxPeers?: number;
}

export interface UpdateRoomInput {
  name?: string;
  maxPeers?: number;
  status?: RoomStatus;
}

// ── Quota helpers ─────────────────────────────────────────────────────────────

/** Derive default project quotas from an organization plan. */
export function deriveQuotaDefaults(plan: Organization['plan']): ProjectQuota {
  return { ...QUOTA_TIERS[plan] };
}

/** Current usage snapshot for quota enforcement. */
export interface ProjectQuotaUsage {
  rooms: number;
  peersPerRoom: number;
  messagesPerMinute: number;
  storageMb: number;
}

/** Check which quota fields are exceeded. Returns the violated field names. */
export function checkQuotaExceeded(
  quota: ProjectQuota,
  usage: ProjectQuotaUsage,
): (keyof ProjectQuota)[] {
  const violated: (keyof ProjectQuota)[] = [];
  const allKeys: (keyof ProjectQuota)[] = [
    'rooms',
    'peersPerRoom',
    'messagesPerMinute',
    'storageMb',
  ];

  for (const key of allKeys) {
    const limit = quota[key];
    const used = usage[key];
    if (limit !== Number.POSITIVE_INFINITY && used > limit) {
      violated.push(key);
    }
  }

  return violated;
}

// ── Project store ─────────────────────────────────────────────────────────────

/** Persistence interface for projects and rooms in Roomful Cloud. */
export interface ProjectStore {
  // Projects
  createProject(orgId: string, input: CreateProjectInput): Promise<Project>;
  getProject(projectId: string): Promise<Project | null>;
  listProjects(orgId: string): Promise<Project[]>;
  updateProject(projectId: string, input: UpdateProjectInput): Promise<Project | null>;
  deleteProject(projectId: string): Promise<boolean>;

  // Rooms
  createRoom(projectId: string, input: CreateRoomInput): Promise<Room>;
  getRoom(roomId: string): Promise<Room | null>;
  listRooms(projectId: string): Promise<Room[]>;
  updateRoom(roomId: string, input: UpdateRoomInput): Promise<Room | null>;
  deleteRoom(roomId: string): Promise<boolean>;
}
