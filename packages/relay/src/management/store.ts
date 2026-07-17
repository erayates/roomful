import { randomUUID } from 'node:crypto';

import type {
  CreateProjectInput,
  CreateRoomInput,
  Project,
  ProjectQuota,
  ProjectUsage,
  RelayDefaults,
  RoomRecord,
  UpdateProjectInput,
  UpdateQuotaInput,
} from './types.js';

// ── Interface ─────────────────────────────────────────────────────────────────

/**
 * Pluggable storage backend for project/room/quota management data.
 *
 * Implementations must be safe for concurrent access. The in-memory
 * version is synchronous; Redis / DB versions will be async.
 */
export interface ManagementStore {
  // ── Projects ────────────────────────────────────────────────────────

  /** Lists all projects visible to `ownerId`. Pass `'*'` to bypass filtering. */
  listProjects(ownerId: string): Project[] | Promise<Project[]>;

  /** Returns a single project, or `null` when not found. */
  getProject(projectId: string): Project | null | Promise<Project | null>;

  /** Creates a project and returns the stored record. */
  createProject(input: CreateProjectInput): Project | Promise<Project>;

  /** Updates a project in-place. Returns the updated record or `null` when not found. */
  updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Project | null | Promise<Project | null>;

  /** Deletes a project and all associated rooms + quota. Returns `true` if it existed. */
  deleteProject(projectId: string): boolean | Promise<boolean>;

  // ── Rooms ───────────────────────────────────────────────────────────

  /** Lists all rooms belonging to a project. */
  listRooms(projectId: string): RoomRecord[] | Promise<RoomRecord[]>;

  /** Returns a single room, or `null` when not found. */
  getRoom(roomId: string): RoomRecord | null | Promise<RoomRecord | null>;

  /** Creates a room record. Throws when the project does not exist. */
  createRoom(projectId: string, input: CreateRoomInput): RoomRecord | Promise<RoomRecord>;

  /** Deletes a room. Returns `true` if it existed. */
  deleteRoom(roomId: string): boolean | Promise<boolean>;

  // ── Quota ───────────────────────────────────────────────────────────

  /** Returns the quota for a project, or `null` when the project has no explicit quota. */
  getQuota(projectId: string): ProjectQuota | null | Promise<ProjectQuota | null>;

  /** Creates or replaces the quota for a project. */
  setQuota(projectId: string, input: UpdateQuotaInput): ProjectQuota | Promise<ProjectQuota>;

  /** Removes the explicit quota for a project so it falls back to relay defaults. */
  deleteQuota(projectId: string): boolean | Promise<boolean>;

  // ── Usage ───────────────────────────────────────────────────────────

  /** Returns a point-in-time usage snapshot for a project. */
  getUsage(projectId: string): ProjectUsage | Promise<ProjectUsage>;
}

// ── In-memory implementation ──────────────────────────────────────────────────

/**
 * A fully synchronous in-memory store suitable for single-process relays
 * and development. All operations are O(1) lookups on Maps.
 */
export class InMemoryManagementStore implements ManagementStore {
  private readonly projects = new Map<string, Project>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly quotas = new Map<string, ProjectQuota>();

  public constructor(private readonly defaults: RelayDefaults) {}

  // ── Projects ────────────────────────────────────────────────────────────────

  public listProjects(ownerId: string): Project[] {
    const all = Array.from(this.projects.values());
    if (ownerId === '*') {
      return all;
    }
    return all.filter((p) => p.ownerId === ownerId);
  }

  public getProject(projectId: string): Project | null {
    return this.projects.get(projectId) ?? null;
  }

  public createProject(input: CreateProjectInput): Project {
    const now = Date.now();
    const id = input.id ?? randomUUID();
    if (this.projects.has(id)) {
      throw Object.assign(new Error(`Project "${id}" already exists.`), {
        code: 'DUPLICATE_PROJECT',
      });
    }

    const project: Project = {
      id,
      name: input.name,
      description: input.description,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
      ownerId: input.ownerId,
    };

    this.projects.set(id, project);
    return project;
  }

  public updateProject(projectId: string, input: UpdateProjectInput): Project | null {
    const existing = this.projects.get(projectId);
    if (!existing) {
      return null;
    }

    const updated: Project = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
      updatedAt: Date.now(),
    };

    this.projects.set(projectId, updated);
    return updated;
  }

  public deleteProject(projectId: string): boolean {
    const existed = this.projects.delete(projectId);
    // Cascade delete rooms and quota.
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.projectId === projectId) {
        this.rooms.delete(roomId);
      }
    }
    this.quotas.delete(projectId);
    return existed;
  }

  // ── Rooms ────────────────────────────────────────────────────────────────────

  public listRooms(projectId: string): RoomRecord[] {
    return Array.from(this.rooms.values()).filter((r) => r.projectId === projectId);
  }

  public getRoom(roomId: string): RoomRecord | null {
    return this.rooms.get(roomId) ?? null;
  }

  public createRoom(projectId: string, input: CreateRoomInput): RoomRecord {
    if (!this.projects.has(projectId)) {
      throw Object.assign(new Error(`Project "${projectId}" does not exist.`), {
        code: 'PROJECT_NOT_FOUND',
      });
    }

    const id = input.id ?? randomUUID();
    if (this.rooms.has(id)) {
      throw Object.assign(new Error(`Room "${id}" already exists.`), {
        code: 'DUPLICATE_ROOM',
      });
    }

    const record: RoomRecord = {
      id,
      projectId,
      name: input.name,
      metadata: input.metadata,
      createdAt: Date.now(),
      ephemeral: input.ephemeral ?? false,
      ttlMs: input.ttlMs ?? 0,
    };

    this.rooms.set(id, record);
    return record;
  }

  public deleteRoom(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  // ── Quota ────────────────────────────────────────────────────────────────────

  public getQuota(projectId: string): ProjectQuota | null {
    return this.quotas.get(projectId) ?? null;
  }

  public setQuota(projectId: string, input: UpdateQuotaInput): ProjectQuota {
    const quota: ProjectQuota = {
      projectId,
      maxRooms: input.maxRooms ?? undefined,
      maxPeersPerRoom: input.maxPeersPerRoom ?? undefined,
      maxTotalPeers: input.maxTotalPeers ?? undefined,
      messageRateLimit: input.messageRateLimit ?? undefined,
      messageRateIntervalMs: input.messageRateIntervalMs ?? undefined,
      maxEphemeralTtlMs: input.maxEphemeralTtlMs ?? undefined,
      maxTotalStateBytes: input.maxTotalStateBytes ?? undefined,
      updatedAt: Date.now(),
    };

    this.quotas.set(projectId, quota);
    return quota;
  }

  public deleteQuota(projectId: string): boolean {
    return this.quotas.delete(projectId);
  }

  // ── Usage ────────────────────────────────────────────────────────────────────

  public getUsage(projectId: string): ProjectUsage {
    const projectRooms = this.listRooms(projectId);
    return {
      projectId,
      roomCount: projectRooms.length,
      totalPeerCount: 0, // Requires relay runtime state — zero in pure store.
      totalStateBytes: 0,
      sampledAt: Date.now(),
    };
  }

  // ── Internal helpers for relay integration ───────────────────────────────────

  /**
   * Returns the relay defaults the store was created with. Used by the
   * management API to resolve effective quotas.
   */
  public getDefaults(): RelayDefaults {
    return this.defaults;
  }
}
