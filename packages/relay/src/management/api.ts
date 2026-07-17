import type { IncomingMessage, ServerResponse } from 'node:http';

import type { ManagementStore } from './store.js';
import {
  createProjectInputSchema,
  createRoomInputSchema,
  type CreateProjectInput,
  type CreateRoomInput,
  type Project,
  type ProjectQuota,
  type ProjectUsage,
  type RelayDefaults,
  type RoomRecord,
  updateProjectInputSchema,
  updateQuotaInputSchema,
} from './types.js';
import { resolveEffectiveQuota, type UpdateProjectInput, type UpdateQuotaInput } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const API_PREFIX = '/api/v1';

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
  // This is a placeholder — real extraction belongs to the auth layer.
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
      // Fall through to default.
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

// ── Path matchers ─────────────────────────────────────────────────────────────

const ROUTES = {
  projects_list: `${API_PREFIX}/projects`,
  projects_create: `${API_PREFIX}/projects`,
  projects_get: `${API_PREFIX}/projects/:projectId`,
  projects_update: `${API_PREFIX}/projects/:projectId`,
  projects_delete: `${API_PREFIX}/projects/:projectId`,
  rooms_list: `${API_PREFIX}/projects/:projectId/rooms`,
  rooms_create: `${API_PREFIX}/projects/:projectId/rooms`,
  rooms_get: `${API_PREFIX}/projects/:projectId/rooms/:roomId`,
  rooms_delete: `${API_PREFIX}/projects/:projectId/rooms/:roomId`,
  quota_get: `${API_PREFIX}/projects/:projectId/quota`,
  quota_update: `${API_PREFIX}/projects/:projectId/quota`,
  usage_get: `${API_PREFIX}/projects/:projectId/usage`,
} as const;

// ── Route handler type ────────────────────────────────────────────────────────

type RouteHandler = (
  store: ManagementStore,
  defaults: RelayDefaults,
  request: IncomingMessage,
  response: ServerResponse,
  params: Record<string, string>,
  ownerId: string,
) => void | Promise<void>;

// ── Handlers ──────────────────────────────────────────────────────────────────

const listProjects: RouteHandler = (store, _defaults, _req, res, _params, ownerId) => {
  const projects = store.listProjects(ownerId);
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
    const project = store.createProject(parsed.data as CreateProjectInput);
    sendCreated(res, await maybeResolve(project));
  } catch (err) {
    const error = err as Error & { code?: string };
    if (error.code === 'DUPLICATE_PROJECT') {
      sendError(res, 409, error.code, error.message);
      return;
    }
    sendError(res, 500, 'INTERNAL_ERROR', error.message);
  }
};

const getProject: RouteHandler = (store, _defaults, _req, res, params) => {
  const project = store.getProject(params.projectId!);
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

  const updated = store.updateProject(params.projectId!, parsed.data as UpdateProjectInput);
  if (!updated) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }
  sendOk(res, await maybeResolve(updated));
};

const deleteProject: RouteHandler = (store, _defaults, _req, res, params) => {
  const existed = store.deleteProject(params.projectId!);
  if (!existed) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }
  sendNoContent(res);
};

const listRooms: RouteHandler = (store, _defaults, _req, res, params) => {
  const rooms = store.listRooms(params.projectId!);
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
    const room = store.createRoom(params.projectId!, parsed.data as CreateRoomInput);
    sendCreated(res, await maybeResolve(room));
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

const getRoom: RouteHandler = (store, _defaults, _req, res, params) => {
  const room = store.getRoom(params.roomId!);
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

const deleteRoom: RouteHandler = (store, _defaults, _req, res, params) => {
  const room = store.getRoom(params.roomId!);
  if (!room || room.projectId !== params.projectId) {
    sendError(res, 404, 'NOT_FOUND', `Room "${params.roomId}" not found.`);
    return;
  }
  store.deleteRoom(params.roomId!);
  sendNoContent(res);
};

const getQuota: RouteHandler = (store, defaults, _req, res, params) => {
  const project = store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }

  const explicitQuota = store.getQuota(params.projectId!);
  const effective = resolveEffectiveQuota(
    explicitQuota instanceof Promise ? undefined : (explicitQuota as ProjectQuota | null) ?? undefined,
    defaults,
  );

  sendOk(res, {
    explicit: explicitQuota,
    effective,
  });
};

const updateQuota: RouteHandler = async (store, _defaults, req, res, params) => {
  const project = store.getProject(params.projectId!);
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

  const quota = store.setQuota(params.projectId!, parsed.data as UpdateQuotaInput);
  sendOk(res, await maybeResolve(quota));
};

const getUsage: RouteHandler = (store, _defaults, _req, res, params) => {
  const project = store.getProject(params.projectId!);
  if (!project) {
    sendError(res, 404, 'NOT_FOUND', `Project "${params.projectId}" not found.`);
    return;
  }

  const usage = store.getUsage(params.projectId!);
  sendOk(res, await maybeResolve(usage));
};

// ── Route table ───────────────────────────────────────────────────────────────

interface RouteEntry {
  method: string;
  handler: RouteHandler;
}

const ROUTE_TABLE: Record<string, RouteEntry> = {
  [`GET ${ROUTES.projects_list}`]: { method: 'GET', handler: listProjects },
  [`POST ${ROUTES.projects_create}`]: { method: 'POST', handler: createProject },
  [`GET ${ROUTES.projects_get}`]: { method: 'GET', handler: getProject },
  [`PUT ${ROUTES.projects_update}`]: { method: 'PUT', handler: updateProject },
  [`DELETE ${ROUTES.projects_delete}`]: { method: 'DELETE', handler: deleteProject },
  [`GET ${ROUTES.rooms_list}`]: { method: 'GET', handler: listRooms },
  [`POST ${ROUTES.rooms_create}`]: { method: 'POST', handler: createRoom },
  [`GET ${ROUTES.rooms_get}`]: { method: 'GET', handler: getRoom },
  [`DELETE ${ROUTES.rooms_delete}`]: { method: 'DELETE', handler: deleteRoom },
  [`GET ${ROUTES.quota_get}`]: { method: 'GET', handler: getQuota },
  [`PUT ${ROUTES.quota_update}`]: { method: 'PUT', handler: updateQuota },
  [`GET ${ROUTES.usage_get}`]: { method: 'GET', handler: getUsage },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function maybeResolve<T>(value: T | Promise<T>): T | Promise<T> {
  return value;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Options for the management API request handler.
 */
export interface ManagementApiOptions {
  /** The management data store. */
  store: ManagementStore;

  /** Relay-wide defaults for quota resolution. */
  defaults: RelayDefaults;

  /**
   * Override the default API prefix. Defaults to `/api/v1`.
   */
  prefix?: string;

  /**
   * Custom authorization callback. If provided, it is called for every
   * management API request. Return `false` or throw to reject with 401.
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
 * or used standalone. It handles CORS preflight, routes matching, JSON
 * parsing/validation, and sends JSON responses.
 *
 * @param options - The management API configuration.
 * @returns A function that handles an incoming HTTP request.
 */
export function createManagementApi(
  options: ManagementApiOptions,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const prefix = options.prefix ?? API_PREFIX;

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
      response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-roomful-owner-id');
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
    for (const [pattern, entry] of Object.entries(ROUTE_TABLE)) {
      const [routeMethod, routePath] = pattern.split(' ', 2);
      if (routeMethod !== method) {
        continue;
      }

      const params = matchParam(path, routePath!);
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

    sendError(response, 404, 'NOT_FOUND', `Route ${method} ${path} not found.`);
  };
}
