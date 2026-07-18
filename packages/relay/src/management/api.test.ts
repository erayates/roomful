import type { IncomingMessage, ServerResponse } from 'node:http';

import { beforeEach, describe, expect, it } from 'vitest';

import { createManagementApi } from './api.js';
import { InMemoryManagementStore } from './store.js';
import type { RelayDefaults } from './types.js';
import { InMemoryUsageEventStore } from './us-store.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const DEFAULTS: RelayDefaults = {
  maxRooms: 100,
  maxPeersPerRoom: 250,
  maxTotalPeers: 10_000,
  messageRateLimit: 20,
  messageRateIntervalMs: 1_000,
  maxEphemeralTtlMs: 86_400_000,
  maxTotalStateBytes: 104_857_600,
};

describe('Management API', () => {
  let store: InMemoryManagementStore;
  let handler: ReturnType<typeof createManagementApi>;

  beforeEach(() => {
    store = new InMemoryManagementStore(DEFAULTS);
    store.createProject({ id: 'proj-1', name: 'Project A', ownerId: 'acct-1' });
    store.createProject({ id: 'proj-2', name: 'Project B', ownerId: 'acct-2' });
    store.createRoom('proj-1', { id: 'room-1' });
    store.createRoom('proj-1', { id: 'room-2' });
    handler = createManagementApi({
      store,
      defaults: DEFAULTS,
      usageEventStore: new InMemoryUsageEventStore(),
    });
  });

  describe('CORS', () => {
    it('responds to OPTIONS preflight', async () => {
      const req = {
        method: 'OPTIONS',
        url: '/api/v1/projects',
        headers: {},
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 0,
        setHeader: () => res,
        end: () => {
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(res.statusCode).toBe(204);
    });
  });

  describe('auth', () => {
    it('rejects requests without owner identifier', async () => {
      let status = 0;
      const req = {
        method: 'GET',
        url: '/api/v1/projects',
        headers: {},
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(401);
    });
  });

  describe('projects', () => {
    it('GET /api/v1/projects lists projects for owner', async () => {
      let status = 0;
      let body = '';
      const req = {
        method: 'GET',
        url: '/api/v1/projects',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(200);
      const projects = JSON.parse(body) as Array<Record<string, unknown>>;
      expect(projects).toHaveLength(1);
      expect(projects[0]?.id).toBe('proj-1');
    });

    it('GET /api/v1/projects lists all for wildcard', async () => {
      let status = 0;
      let body = '';
      const req = {
        method: 'GET',
        url: '/api/v1/projects',
        headers: { 'x-roomful-owner-id': '*' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(200);
      expect(JSON.parse(body)).toHaveLength(2);
    });

    it('POST /api/v1/projects creates a project', async () => {
      let status = 0;
      let body = '';
      let resolveBody: ((value: void) => void) | undefined;
      const bodyPromise = new Promise<void>((resolve) => {
        resolveBody = resolve;
      });
      const req = {
        method: 'POST',
        url: '/api/v1/projects',
        headers: { 'x-roomful-owner-id': 'acct-1', 'content-type': 'application/json' },
        on: (e: string, fn: (...a: unknown[]) => void) => {
          if (e === 'data') {
            setTimeout(() => {
              fn(JSON.stringify({ name: 'New', ownerId: 'acct-1' }));
            }, 0);
          }
          if (e === 'end') {
            setTimeout(() => {
              fn();
              resolveBody?.();
            }, 0);
          }
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      await bodyPromise;
      expect(status).toBe(201);
      expect(JSON.parse(body)).toHaveProperty('id');
    });

    it('POST validates input', async () => {
      let status = 0;
      let bl: ((c: string) => void) | undefined;
      let el: (() => void) | undefined;
      const req = {
        method: 'POST',
        url: '/api/v1/projects',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: (e: string, fn: (...a: unknown[]) => void) => {
          if (e === 'data') bl = fn as (c: string) => void;
          if (e === 'end') el = fn as () => void;
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      const p = handler(req, res);
      if (bl) bl(JSON.stringify({}));
      if (el) el();
      await p;
      expect(status).toBe(400);
    });

    it('POST rejects duplicate id', async () => {
      let status = 0;
      let bl: ((c: string) => void) | undefined;
      let el: (() => void) | undefined;
      const req = {
        method: 'POST',
        url: '/api/v1/projects',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: (e: string, fn: (...a: unknown[]) => void) => {
          if (e === 'data') bl = fn as (c: string) => void;
          if (e === 'end') el = fn as () => void;
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      const p = handler(req, res);
      if (bl) bl(JSON.stringify({ id: 'proj-1', name: 'Dup', ownerId: 'acct-1' }));
      if (el) el();
      await p;
      expect(status).toBe(409);
    });

    it('GET /api/v1/projects/:id returns project', async () => {
      let status = 0;
      let body = '';
      const req = {
        method: 'GET',
        url: '/api/v1/projects/proj-1',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(200);
      expect(JSON.parse(body)).toHaveProperty('id', 'proj-1');
    });

    it('GET returns 404 for unknown project', async () => {
      let status = 0;
      const req = {
        method: 'GET',
        url: '/api/v1/projects/nope',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(404);
    });

    it('PUT /api/v1/projects/:id updates project', async () => {
      let status = 0;
      let body = '';
      let bl: ((c: string) => void) | undefined;
      let el: (() => void) | undefined;
      const req = {
        method: 'PUT',
        url: '/api/v1/projects/proj-1',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: (e: string, fn: (...a: unknown[]) => void) => {
          if (e === 'data') bl = fn as (c: string) => void;
          if (e === 'end') el = fn as () => void;
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      const p = handler(req, res);
      if (bl) bl(JSON.stringify({ name: 'Updated' }));
      if (el) el();
      await p;
      expect(status).toBe(200);
      expect(JSON.parse(body)).toHaveProperty('name', 'Updated');
    });

    it('DELETE /api/v1/projects/:id deletes project', async () => {
      let status = 0;
      const req = {
        method: 'DELETE',
        url: '/api/v1/projects/proj-1',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(204);
    });
  });

  describe('rooms', () => {
    it('GET /api/v1/projects/:id/rooms lists rooms', async () => {
      let status = 0;
      let body = '';
      const req = {
        method: 'GET',
        url: '/api/v1/projects/proj-1/rooms',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(200);
      expect(JSON.parse(body)).toHaveLength(2);
    });

    it('POST /api/v1/projects/:id/rooms creates room', async () => {
      let status = 0;
      let bl: ((c: string) => void) | undefined;
      let el: (() => void) | undefined;
      const req = {
        method: 'POST',
        url: '/api/v1/projects/proj-1/rooms',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: (e: string, fn: (...a: unknown[]) => void) => {
          if (e === 'data') bl = fn as (c: string) => void;
          if (e === 'end') el = fn as () => void;
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      const p = handler(req, res);
      if (bl) bl(JSON.stringify({ name: 'New Room' }));
      if (el) el();
      await p;
      expect(status).toBe(201);
    });

    it('POST returns 404 for unknown project', async () => {
      let status = 0;
      let bl: ((c: string) => void) | undefined;
      let el: (() => void) | undefined;
      const req = {
        method: 'POST',
        url: '/api/v1/projects/nope/rooms',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: (e: string, fn: (...a: unknown[]) => void) => {
          if (e === 'data') bl = fn as (c: string) => void;
          if (e === 'end') el = fn as () => void;
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      const p = handler(req, res);
      if (bl) bl(JSON.stringify({ name: 'R' }));
      if (el) el();
      await p;
      expect(status).toBe(404);
    });

    it('DELETE /api/v1/projects/:pid/rooms/:rid deletes room', async () => {
      let status = 0;
      const req = {
        method: 'DELETE',
        url: '/api/v1/projects/proj-1/rooms/room-1',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(204);
    });
  });

  describe('quota & usage', () => {
    it('GET /api/v1/projects/:id/quota returns effective quota', async () => {
      let status = 0;
      let body = '';
      const req = {
        method: 'GET',
        url: '/api/v1/projects/proj-1/quota',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(200);
      const data = JSON.parse(body) as Record<string, unknown>;
      expect(data).toHaveProperty('effective');
      expect((data.effective as Record<string, unknown>).maxRooms).toBe(DEFAULTS.maxRooms);
    });

    it('PUT /api/v1/projects/:id/quota sets quota', async () => {
      let status = 0;
      let body = '';
      let resolveBody: ((value: void) => void) | undefined;
      const bodyPromise = new Promise<void>((resolve) => {
        resolveBody = resolve;
      });
      const req = {
        method: 'PUT',
        url: '/api/v1/projects/proj-1/quota',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: (e: string, fn: (...a: unknown[]) => void) => {
          if (e === 'data') {
            setTimeout(() => {
              fn(JSON.stringify({ maxRooms: 10 }));
            }, 0);
          }
          if (e === 'end') {
            setTimeout(() => {
              fn();
              resolveBody?.();
            }, 0);
          }
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      await bodyPromise;
      expect(status).toBe(200);
      expect(JSON.parse(body)).toHaveProperty('maxRooms', 10);
    });

    it('GET /api/v1/projects/:id/usage returns usage', async () => {
      let status = 0;
      let body = '';
      const req = {
        method: 'GET',
        url: '/api/v1/projects/proj-1/usage',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(200);
      expect(JSON.parse(body)).toHaveProperty('roomCount', 2);
    });

    it('POST /api/v1/projects/:id/usage/events records a usage event', async () => {
      let status = 0;
      let body = '';
      const req = {
        method: 'POST',
        url: '/api/v1/projects/proj-1/usage/events',
        headers: { 'x-roomful-owner-id': 'acct-1', 'content-type': 'application/json' },
        on: (event: string, cb: (chunk?: string) => void) => {
          if (event === 'data') cb(JSON.stringify({ roomId: 'room-1', eventType: 'peer.connection', quantity: 1 }));
          if (event === 'end') cb();
          return req;
        },
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 201,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(201);
      const parsed = JSON.parse(body);
      expect(parsed).toHaveProperty('id');
      expect(parsed).toHaveProperty('eventType', 'peer.connection');
    });

    it('GET /api/v1/projects/:id/usage/events lists usage events', async () => {
      // Record an event first
      const postReq = {
        method: 'POST',
        url: '/api/v1/projects/proj-1/usage/events',
        headers: { 'x-roomful-owner-id': 'acct-1', 'content-type': 'application/json' },
        on: (event: string, cb: (chunk?: string) => void) => {
          if (event === 'data') cb(JSON.stringify({ roomId: 'room-1', eventType: 'peer.connection', quantity: 1 }));
          if (event === 'end') cb();
          return postReq;
        },
        off: () => postReq,
      } as unknown as IncomingMessage;
      const postRes = {
        statusCode: 201,
        setHeader: () => postRes,
        end: () => postRes,
        writeHead: () => postRes,
      } as unknown as ServerResponse;
      await handler(postReq, postRes);

      // Now query
      let status = 0;
      let body = '';
      const req = {
        method: 'GET',
        url: '/api/v1/projects/proj-1/usage/events?from=0&to=9999999999999',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: (data?: string) => {
          status = res.statusCode;
          body = data ?? '';
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(200);
      expect(Array.isArray(JSON.parse(body))).toBe(true);
    });

    it('GET /api/v1/projects/:id/usage/events returns 501 when no usageEventStore', async () => {
      const handlerNoStore = createManagementApi({ store, defaults: DEFAULTS });
      let status = 0;
      const req = {
        method: 'GET',
        url: '/api/v1/projects/proj-1/usage/events',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => { status = res.statusCode; return res; },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handlerNoStore(req, res);
      expect(status).toBe(501);
    });
  });

  describe('error handling', () => {
    it('returns 404 for unknown routes', async () => {
      let status = 0;
      const req = {
        method: 'GET',
        url: '/api/v1/unknown',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(404);
    });

    it('returns 404 for non-management paths', async () => {
      let status = 0;
      const req = {
        method: 'GET',
        url: '/other/path',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await handler(req, res);
      expect(status).toBe(404);
    });

    it('supports custom authorize callback', async () => {
      const authorizedHandler = createManagementApi({
        store,
        defaults: DEFAULTS,
        authorize: () => false,
      });
      let status = 0;
      const req = {
        method: 'GET',
        url: '/api/v1/projects',
        headers: { 'x-roomful-owner-id': 'acct-1' },
        on: () => req,
        off: () => req,
      } as unknown as IncomingMessage;
      const res = {
        statusCode: 200,
        setHeader: () => res,
        end: () => {
          status = res.statusCode;
          return res;
        },
        writeHead: () => res,
      } as unknown as ServerResponse;
      await authorizedHandler(req, res);
      expect(status).toBe(403);
    });
  });
});
