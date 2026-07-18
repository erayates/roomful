import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ManagementStore } from './store.js';
import {
  createProjectInputSchema,
  createRoomInputSchema,
  recordUsageEventInputSchema,
  type RelayDefaults,
  resolveEffectiveQuota,
  updateProjectInputSchema,
  updateQuotaInputSchema,
  usageQuerySchema,
} from './types.js';
import type { UsageEventStore } from './us-store.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/consistent-type-assertions */

// ── Helpers ───────────────────────────────────────────────────────────────────

function readSingleHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 1024 * 1024;

    const cleanup = (): void => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
    };

    const onData = (chunk: Buffer | string): void => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) {
        cleanup();
        reject(new Error('Request body too large.'));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };

    const onEnd = (): void => {
      cleanup();
      const body = Buffer.concat(chunks).toString('utf8');
      if (body.trim().length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    };

    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
  });
}

function sendOk(response: ServerResponse, payload: unknown): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function sendCreated(response: ServerResponse, payload: unknown): void {
  response.statusCode = 201;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function sendNoContent(response: ServerResponse): void {
  response.statusCode = 204;
  response.end();
}

function sendError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ code, message }));
}

function resolveOwnerId(request: IncomingMessage): string {
  // Extract owner from Authorization Bearer token or a custom header.
  // For JWT-based auth, the owner is extracted from the token claims.
  const auth = readSingleHeader(request, 'authorization');
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = auth.slice(7).split('.')[1];
      if (payload) {
        const claims = JSON.parse(
          Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
        );
        return String(claims.sub ?? claims.ownerId ?? '');
      }
    } catch {
      // Fall through to custom header.
    }
  }

  // Custom header for API key based access.
  const apiKeyOwner = readSingleHeader(request, 'x-roomful-owner-id');
  if (apiKeyOwner && apiKeyOwner.length > 0) {
    return apiKeyOwner;
  }

  return '';
}

function matchParam(path: string, pattern: string): Record<string, string> | null {
  const pathParts = path.replace(/\/$/, '').split('/');
  const patternParts = pattern.split('/');

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    const ppPath = pathParts[i]!;
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = ppPath;
    } else if (pp !== ppPath) {
      return null;
    }
  }

  return params;
}

// ── Path patterns (relative to the management prefix) ────────────────────────

const PATH_PATTERNS = {
  projects_list: '/projects',
  projects_get: '/projects/:projectId',
  rooms_list: '/projects/:projectId/rooms',
  rooms_get: '/projects/:projectId/rooms/:roomId',
  quota_get: '/projects/:projectId/quota',
  usage_get: '/projects/:projectId/usage',
  usage_events_list: '/projects/:projectId/usage/events',
  usage_events_record: '/projects/:projectId/usage/events',
} as const;

// ── Route handler type ────────────────────────────────────────────────────────

type RouteHandler = (
  store: ManagementStore,
  defaults: RelayDefaults,
  request: IncomingMessage,
  response: ServerResponse,
  params: Record<string, string>,
  ownerId: string,
) => Promise<void>;

// ── Route table entry ─────────────────────────────────────────────────────────

interface RouteEntry {
  method: string;
  handler: RouteHandler;
  usageHandler?: false;
}

interface UsageEventRouteEntry {
  method: string;
  handler: UsageEventRouteHandler;
  usageHandler: true;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const listProjects: RouteHandler = async (store, _defaults, _req, res, _params, ownerId) => {
  const projects = await store.listProjects(ownerId);
  sendOk(res, projects);
};

const createProject: RouteHandler = async (store, _defaults, req, res) => {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, 'INVALID_BODY', 'Request body is not valid JSON.');
    return;
  }

  const parsed = createProjectInputSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input.');
    return;
  }

  try {
    const project = await store.createProject(parsed.data);
    sendCreated(res, project);
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'DUPLICATE_PROJECT') {
      sendError(res, 409, error.code, error.message);
      return;
    }
    sendError(res, 500, 'INTERNAL_ERROR', error.message);
  }
};

const getProject: RouteHandler = async (store, _defaults, _req, res, params) => {
  const project = await store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }
  sendOk(res, project);
};

const updateProject: RouteHandler = async (store, _defaults, req, res, params) => {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, 'INVALID_BODY', 'Request body is not valid JSON.');
    return;
  }

  const parsed = updateProjectInputSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input.');
    return;
  }

  const updated = await store.updateProject(params.projectId!, parsed.data);
  if (!updated) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }
  sendOk(res, updated);
};

const deleteProject: RouteHandler = async (store, _defaults, _req, res, params) => {
  const existed = await store.deleteProject(params.projectId!);
  if (!existed) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }
  sendNoContent(res);
};

const listRooms: RouteHandler = async (store, _defaults, _req, res, params) => {
  const rooms = await store.listRooms(params.projectId!);
  sendOk(res, rooms);
};

const createRoom: RouteHandler = async (store, _defaults, req, res, params) => {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, 'INVALID_BODY', 'Request body is not valid JSON.');
    return;
  }

  const parsed = createRoomInputSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input.');
    return;
  }

  try {
    const room = await store.createRoom(params.projectId!, parsed.data);
    sendCreated(res, room);
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'PROJECT_NOT_FOUND') {
      sendError(res, 404, error.code, error.message);
      return;
    }
    if (error.code === 'DUPLICATE_ROOM') {
      sendError(res, 409, error.code, error.message);
      return;
    }
    sendError(res, 500, 'INTERNAL_ERROR', error.message);
  }
};

const getRoom: RouteHandler = async (store, _defaults, _req, res, params) => {
  const room = await store.getRoom(params.roomId!);
  if (!room) {
    sendError(res, 404, 'NOT_FOUND', `Room "${params.roomId}" not found.`);
    return;
  }
  if (room.projectId !== params.projectId) {
    sendError(res, 404, 'NOT_FOUND', `Room "${params.roomId}" not found in this project.`);
    return;
  }
  sendOk(res, room);
};

const deleteRoom: RouteHandler = async (store, _defaults, _req, res, params) => {
  const room = await store.getRoom(params.roomId!);
  if (!room || room.projectId !== params.projectId) {
    sendError(res, 404, 'NOT_FOUND', `Room "${params.roomId}" not found.`);
    return;
  }
  await store.deleteRoom(params.roomId!);
  sendNoContent(res);
};

const getQuota: RouteHandler = async (store, defaults, _req, res, params) => {
  const project = await store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }

  const explicitQuota = await store.getQuota(params.projectId!);
  const effective = resolveEffectiveQuota(explicitQuota ?? undefined, defaults);

  sendOk(res, {
    explicit: explicitQuota,
    effective,
  });
};

const updateQuota: RouteHandler = async (store, _defaults, req, res, params) => {
  const project = await store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, 'INVALID_BODY', 'Request body is not valid JSON.');
    return;
  }

  const parsed = updateQuotaInputSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input.');
    return;
  }

  const quota = await store.setQuota(params.projectId!, parsed.data);
  sendOk(res, quota);
};

const getUsage: RouteHandler = async (store, _defaults, _req, res, params) => {
  const project = await store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }

  const usage = await store.getUsage(params.projectId!);
  sendOk(res, usage);
};

// ── Usage event handlers ──────────────────────────────────────────────────────

type UsageEventRouteHandler = (
  usageStore: UsageEventStore,
  store: ManagementStore,
  defaults: RelayDefaults,
  request: IncomingMessage,
  response: ServerResponse,
  params: Record<string, string>,
  ownerId: string,
) => Promise<void>;

const listUsageEvents: UsageEventRouteHandler = async (usageStore, store, _defaults, req, res, params) => {
  const project = await store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }

  const url = new URL(req.url ?? '/', 'http://relay.local');
  const from = Number(url.searchParams.get('from')) || Date.now() - 86400000 * 7;
  const to = Number(url.searchParams.get('to')) || Date.now();
  const eventTypesRaw = url.searchParams.get('eventTypes');

  const query: { projectId: string; from: number; to: number; eventTypes?: string[] } = {
    projectId: params.projectId!,
    from,
    to,
  };

  if (eventTypesRaw) {
    query.eventTypes = eventTypesRaw.split(',');
  }

  const parsed = usageQuerySchema.safeParse(query);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query.');
    return;
  }

  const events = await usageStore.query(parsed.data as never);
  sendOk(res, events);
};

const recordUsageEvent: UsageEventRouteHandler = async (usageStore, store, _defaults, req, res, params) => {
  const project = await store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, 'INVALID_BODY', 'Request body is not valid JSON.');
    return;
  }

  const parsed = recordUsageEventInputSchema.safeParse(body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid input.');
    return;
  }

  const input = parsed.data;
  const event = {
    id: crypto.randomUUID(),
    projectId: params.projectId!,
    roomId: input.roomId,
    eventType: input.eventType,
    quantity: input.quantity,
    unit: input.unit ?? 'count',
    metadata: (input.metadata ?? {}),
    recordedAt: Date.now(),
  };

  await usageStore.record(event);
  sendCreated(res, event);
};

// ── Build route table ─────────────────────────────────────────────────────────

function buildRouteTable(prefix: string): Record<string, RouteEntry | UsageEventRouteEntry> {
  const p = (path: string): string => `${prefix}${path}`;

  return {
    [`GET ${p(PATH_PATTERNS.projects_list)}`]: { method: 'GET', handler: listProjects, usageHandler: false },
    [`POST ${p(PATH_PATTERNS.projects_list)}`]: { method: 'POST', handler: createProject, usageHandler: false },
    [`GET ${p(PATH_PATTERNS.projects_get)}`]: { method: 'GET', handler: getProject, usageHandler: false },
    [`PUT ${p(PATH_PATTERNS.projects_get)}`]: { method: 'PUT', handler: updateProject, usageHandler: false },
    [`DELETE ${p(PATH_PATTERNS.projects_get)}`]: { method: 'DELETE', handler: deleteProject, usageHandler: false },
    [`GET ${p(PATH_PATTERNS.rooms_list)}`]: { method: 'GET', handler: listRooms, usageHandler: false },
    [`POST ${p(PATH_PATTERNS.rooms_list)}`]: { method: 'POST', handler: createRoom, usageHandler: false },
    [`GET ${p(PATH_PATTERNS.rooms_get)}`]: { method: 'GET', handler: getRoom, usageHandler: false },
    [`DELETE ${p(PATH_PATTERNS.rooms_get)}`]: { method: 'DELETE', handler: deleteRoom, usageHandler: false },
    [`GET ${p(PATH_PATTERNS.quota_get)}`]: { method: 'GET', handler: getQuota, usageHandler: false },
    [`PUT ${p(PATH_PATTERNS.quota_get)}`]: { method: 'PUT', handler: updateQuota, usageHandler: false },
    [`GET ${p(PATH_PATTERNS.usage_get)}`]: { method: 'GET', handler: getUsage, usageHandler: false },
    [`GET ${p(PATH_PATTERNS.usage_events_list)}`]: { method: 'GET', handler: listUsageEvents as never, usageHandler: true },
    [`POST ${p(PATH_PATTERNS.usage_events_record)}`]: { method: 'POST', handler: recordUsageEvent as never, usageHandler: true },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Options for the management API request handler.
 */
export interface ManagementApiOptions {
  /** The management data store. */
  store: ManagementStore;

  /** Optional usage event store for recording/querying usage events. */
  usageEventStore?: UsageEventStore;

  /** Relay-wide defaults for quota resolution. */
  defaults: RelayDefaults;

  /**
   * Override the default API prefix. Defaults to `/api/v1`.
   */
  prefix?: string;

  /**
   * Custom authorization callback. Called for every management API request.
   * Return `false` or throw to reject with 403.
   *
   * @param request - The incoming HTTP request.
   * @param ownerId - The resolved owner from auth headers.
   * @param action - The handler name (e.g. "createProject").
   * @param projectId - The project id from the URL when applicable.
   */
  authorize?: (
    request: IncomingMessage,
    ownerId: string,
    action: string,
    projectId?: string,
  ) => boolean | Promise<boolean>;
}

/**
 * Creates an HTTP request handler for the management REST API.
 *
 * The returned handler can be mounted into the relay's existing HTTP server
 * or used standalone. It handles CORS preflight, route matching, JSON
 * parsing/validation, and sends JSON responses.
 *
 * Endpoints:
 * ```
 * GET    /prefix/projects                    List projects
 * POST   /prefix/projects                    Create project
 * GET    /prefix/projects/:projectId         Get project
 * PUT    /prefix/projects/:projectId         Update project
 * DELETE /prefix/projects/:projectId         Delete project
 * GET    /prefix/projects/:projectId/rooms              List rooms
 * POST   /prefix/projects/:projectId/rooms              Create room
 * GET    /prefix/projects/:projectId/rooms/:roomId      Get room
 * DELETE /prefix/projects/:projectId/rooms/:roomId      Delete room
 * GET    /prefix/projects/:projectId/quota              Get quota
 * PUT    /prefix/projects/:projectId/quota              Set quota
 * GET    /prefix/projects/:projectId/usage              Get usage
 * ```
 *
 * @param options - The management API configuration.
 * @returns A function that handles an incoming HTTP request.
 */
export function createManagementApi(
  options: ManagementApiOptions,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const prefix = options.prefix ?? '/api/v1';
  const routeTable = buildRouteTable(prefix);

  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';

    // Only handle paths under the management API prefix.
    if (!path.startsWith(prefix)) {
      response.statusCode = 404;
      response.end();
      return;
    }

    // CORS preflight.
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        'content-type, authorization, x-roomful-owner-id',
      );
      response.end();
      return;
    }

    // Resolve owner from auth headers.
    const ownerId = resolveOwnerId(request);
    if (!ownerId) {
      sendError(response, 401, 'UNAUTHORIZED', 'Missing or invalid authorization.');
      return;
    }

    // Match route.
    const method = request.method ?? 'GET';
    for (const [pattern, entry] of Object.entries(routeTable)) {
      const [routeMethod, routePath] = pattern.split(' ', 2);
      if (routeMethod !== method || !routePath) {
        continue;
      }

      // Skip usage event routes — handled below.
      if ('usageHandler' in entry && entry.usageHandler) {
        continue;
      }

      const params = matchParam(path, routePath);
      if (!params) {
        continue;
      }

      // Authorize.
      if (options.authorize) {
        try {
          const allowed = await options.authorize(
            request,
            ownerId,
            entry.handler.name,
            params.projectId,
          );
          if (!allowed) {
            sendError(response, 403, 'FORBIDDEN', 'Access denied.');
            return;
          }
        } catch {
          sendError(response, 403, 'FORBIDDEN', 'Authorization failed.');
          return;
        }
      }

      try {
        await entry.handler(options.store, options.defaults, request, response, params, ownerId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error.';
        sendError(response, 500, 'INTERNAL_ERROR', message);
      }
      return;
    }

    // Match usage event routes (need usageEventStore)
    const usageEventRoutes = Object.entries(routeTable).filter(
      (e): e is [string, UsageEventRouteEntry] => 'usageHandler' in e[1] && e[1].usageHandler,
    );
    for (const [pattern, entry] of usageEventRoutes) {
      const [routeMethod, routePath] = pattern.split(' ', 2);
      if (routeMethod !== method || !routePath) {
        continue;
      }

      const params = matchParam(path, routePath);
      if (!params) {
        continue;
      }

      // Authorize.
      if (options.authorize) {
        try {
          const allowed = await options.authorize(
            request,
            ownerId,
            entry.handler.name,
            params.projectId,
          );
          if (!allowed) {
            sendError(response, 403, 'FORBIDDEN', 'Access denied.');
            return;
          }
        } catch {
          sendError(response, 403, 'FORBIDDEN', 'Authorization failed.');
          return;
        }
      }

      if (!options.usageEventStore) {
        sendError(response, 501, 'NOT_IMPLEMENTED', 'Usage event store is not configured.');
        return;
      }

      try {
        await entry.handler(options.usageEventStore, options.store, options.defaults, request, response, params, ownerId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Internal server error.';
        sendError(response, 500, 'INTERNAL_ERROR', message);
      }
      return;
    }

    sendError(response, 404, 'NOT_FOUND', `Route ${method} ${path} not found.`);
  };
}
