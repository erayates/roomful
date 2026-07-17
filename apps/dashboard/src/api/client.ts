/**
 * API client for Roomful Cloud management REST API.
 *
 * Base URL is the relay server address with the management prefix.
 */

import type { ProjectQuota } from '@roomful/cloud-api';

// ── Config ────────────────────────────────────────────────────────────────────

export interface DashboardConfig {
  /** Management API base URL, e.g. http://127.0.0.1:8787/api/v1 */
  baseUrl: string;
  /** Owner ID sent as x-roomful-owner-id header */
  ownerId: string;
  /** Optional Bearer token for authorization */
  token?: string;
}

let config: DashboardConfig | undefined;

export function configureDashboard(cfg: DashboardConfig): void {
  config = cfg;
}

export function getConfig(): DashboardConfig {
  if (!config) {
    throw Object.assign(
      new Error('Dashboard not configured. Call configureDashboard() first.'),
      {},
    );
  }
  return config;
}

// ── Fetch wrapper ─────────────────────────────────────────────────────────────

interface ApiError {
  status: number;
  code: string;
  message: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-roomful-owner-id': cfg.ownerId,
  };

  if (cfg.token) {
    headers['authorization'] = `Bearer ${cfg.token}`;
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const errorBody = (await response.json()) as ApiError | undefined;
    throw Object.assign(new Error(errorBody?.message ?? `HTTP ${response.status}`), {
      status: response.status,
      code: errorBody?.code,
    });
  }

  if (response.status === 204) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return undefined as T;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return (await response.json()) as T;
}

// ── API methods ───────────────────────────────────────────────────────────────

// Projects

export interface RelayProject {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
}

export type CreateProjectInput = {
  id?: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ownerId: string;
};

export type UpdateProjectInput = {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export async function listProjects(): Promise<RelayProject[]> {
  return request<RelayProject[]>('GET', 'projects');
}

export async function getProject(id: string): Promise<RelayProject> {
  return request<RelayProject>('GET', `projects/${encodeURIComponent(id)}`);
}

export async function createProject(input: CreateProjectInput): Promise<RelayProject> {
  return request<RelayProject>('POST', 'projects', input);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<RelayProject> {
  return request<RelayProject>('PUT', `projects/${encodeURIComponent(id)}`, input);
}

export async function deleteProject(id: string): Promise<void> {
  await request<void>('DELETE', `projects/${encodeURIComponent(id)}`);
}

// Rooms

export interface RelayRoom {
  id: string;
  projectId: string;
  name?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  ephemeral: boolean;
  ttlMs: number;
}

export type CreateRoomInput = {
  id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  ephemeral?: boolean;
  ttlMs?: number;
};

export async function listRooms(projectId: string): Promise<RelayRoom[]> {
  return request<RelayRoom[]>('GET', `projects/${encodeURIComponent(projectId)}/rooms`);
}

export async function getRoom(projectId: string, roomId: string): Promise<RelayRoom> {
  return request<RelayRoom>(
    'GET',
    `projects/${encodeURIComponent(projectId)}/rooms/${encodeURIComponent(roomId)}`,
  );
}

export async function createRoom(projectId: string, input: CreateRoomInput): Promise<RelayRoom> {
  return request<RelayRoom>('POST', `projects/${encodeURIComponent(projectId)}/rooms`, input);
}

export async function deleteRoom(projectId: string, roomId: string): Promise<void> {
  await request<void>(
    'DELETE',
    `projects/${encodeURIComponent(projectId)}/rooms/${encodeURIComponent(roomId)}`,
  );
}

// Quota

export interface QuotaResponse {
  explicit: ProjectQuota | null;
  effective: ProjectQuota;
}

export type UpdateQuotaInput = {
  maxRooms?: number;
  maxPeersPerRoom?: number;
  maxTotalPeers?: number;
  messageRateLimit?: number;
  messageRateIntervalMs?: number;
  maxEphemeralTtlMs?: number;
  maxTotalStateBytes?: number;
};

export async function getQuota(projectId: string): Promise<QuotaResponse> {
  return request<QuotaResponse>('GET', `projects/${encodeURIComponent(projectId)}/quota`);
}

export async function setQuota(projectId: string, input: UpdateQuotaInput): Promise<ProjectQuota> {
  return request<ProjectQuota>('PUT', `projects/${encodeURIComponent(projectId)}/quota`, input);
}

// Usage

export interface UsageSnapshot {
  projectId: string;
  roomCount: number;
  totalPeerCount: number;
  totalStateBytes: number;
  sampledAt: number;
}

export async function getUsage(projectId: string): Promise<UsageSnapshot> {
  return request<UsageSnapshot>('GET', `projects/${encodeURIComponent(projectId)}/usage`);
}
