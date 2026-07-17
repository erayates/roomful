import { randomBytes } from 'node:crypto';

import type {
  CreateProjectInput,
  CreateRoomInput,
  Project,
  ProjectStore,
  Room,
  UpdateProjectInput,
  UpdateRoomInput,
} from './models.js';

function generateId(): string {
  return randomBytes(12).toString('hex');
}

function now(): string {
  return new Date().toISOString();
}

export class InMemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>();
  private readonly rooms = new Map<string, Room>();
  private readonly roomsByProject = new Map<string, Set<string>>();

  // ── Projects ──────────────────────────────────────────────────────────────

  async createProject(orgId: string, input: CreateProjectInput): Promise<Project> {
    const id = generateId();
    const ts = now();

    const project: Project = {
      id,
      orgId,
      name: input.name,
      slug:
        input.slug ??
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      quotaRooms: 5,
      quotaPeersPerRoom: 25,
      quotaMessagesPerMinute: 500,
      quotaStorageMb: 50,
      createdAt: ts,
      updatedAt: ts,
    };

    this.projects.set(id, project);
    return { ...project };
  }

  async getProject(projectId: string): Promise<Project | null> {
    const project = this.projects.get(projectId);
    return project ? { ...project } : null;
  }

  async listProjects(orgId: string): Promise<Project[]> {
    return [...this.projects.values()].filter((p) => p.orgId === orgId).map((p) => ({ ...p }));
  }

  async updateProject(projectId: string, input: UpdateProjectInput): Promise<Project | null> {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const updated: Project = {
      ...project,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.quotaRooms !== undefined ? { quotaRooms: input.quotaRooms } : {}),
      ...(input.quotaPeersPerRoom !== undefined
        ? { quotaPeersPerRoom: input.quotaPeersPerRoom }
        : {}),
      ...(input.quotaMessagesPerMinute !== undefined
        ? { quotaMessagesPerMinute: input.quotaMessagesPerMinute }
        : {}),
      ...(input.quotaStorageMb !== undefined ? { quotaStorageMb: input.quotaStorageMb } : {}),
      updatedAt: now(),
    };

    this.projects.set(projectId, updated);
    return { ...updated };
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const existed = this.projects.has(projectId);
    if (!existed) return false;

    // Cascade-delete rooms.
    const roomIds = this.roomsByProject.get(projectId);
    if (roomIds) {
      for (const roomId of roomIds) {
        this.rooms.delete(roomId);
      }
      this.roomsByProject.delete(projectId);
    }

    this.projects.delete(projectId);
    return true;
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  async createRoom(projectId: string, input: CreateRoomInput): Promise<Room> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project "${projectId}" not found.`), {
        code: 'PROJECT_NOT_FOUND',
      });
    }

    const id = generateId();
    const ts = now();

    const room: Room = {
      id,
      projectId,
      name: input.name,
      status: 'active',
      maxPeers: input.maxPeers ?? project.quotaPeersPerRoom,
      peerCount: 0,
      createdAt: ts,
      updatedAt: ts,
      closedAt: null,
    };

    this.rooms.set(id, room);

    let set = this.roomsByProject.get(projectId);
    if (!set) {
      set = new Set();
      this.roomsByProject.set(projectId, set);
    }
    set.add(id);

    return { ...room };
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const room = this.rooms.get(roomId);
    return room ? { ...room } : null;
  }

  async listRooms(projectId: string): Promise<Room[]> {
    const roomIds = this.roomsByProject.get(projectId);
    if (!roomIds) return [];

    return [...roomIds]
      .map((id) => this.rooms.get(id))
      .filter((r): r is Room => r !== undefined)
      .map((r) => ({ ...r }));
  }

  async updateRoom(roomId: string, input: UpdateRoomInput): Promise<Room | null> {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const updated: Room = {
      ...room,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.maxPeers !== undefined ? { maxPeers: input.maxPeers } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.status === 'closed' && !room.closedAt ? { closedAt: now() } : {}),
      updatedAt: now(),
    };

    this.rooms.set(roomId, updated);
    return { ...updated };
  }

  async deleteRoom(roomId: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    this.rooms.delete(roomId);

    const set = this.roomsByProject.get(room.projectId);
    if (set) {
      set.delete(roomId);
      if (set.size === 0) {
        this.roomsByProject.delete(room.projectId);
      }
    }

    return true;
  }
}
