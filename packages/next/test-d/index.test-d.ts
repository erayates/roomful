import type { RelayAuthToken } from '@roomful/core';
import { expectAssignable, expectType } from 'tsd';

import {
  createRoomfulTokenRoute,
  fetchRoomfulToken,
  type IssueRoomfulTokenOptions,
  issueRoomfulToken,
  type RoomfulTokenAuthorizeResult,
  type RoomfulTokenRouteOptions,
} from '..';

const issueOptions = {
  secret: 'relay-secret',
  subject: 'peer-a',
  roomId: 'room-1',
  expiresInSeconds: 600,
  notBeforeSeconds: 30,
  issuedAt: 1_700_000_000,
  claims: { role: 'editor' },
} satisfies IssueRoomfulTokenOptions;
expectType<string>(issueOptions.secret);

const token = issueRoomfulToken({ secret: 'relay-secret' });
expectType<Promise<string>>(token);

const authorizeResult: RoomfulTokenAuthorizeResult = {
  subject: 'peer-a',
  roomId: 'room-1',
  claims: { tier: 'pro' },
  expiresInSeconds: 900,
};
expectType<string | undefined>(authorizeResult.subject);
expectType<string | undefined>(authorizeResult.roomId);
expectType<Record<string, unknown> | undefined>(authorizeResult.claims);
expectType<number | undefined>(authorizeResult.expiresInSeconds);

const routeOptions = {
  secret: 'relay-secret',
  authorize: async (request: Request): Promise<RoomfulTokenAuthorizeResult | Response> => {
    expectType<Request>(request);
    return { subject: 'peer-a' };
  },
} satisfies RoomfulTokenRouteOptions;

const handler = createRoomfulTokenRoute(routeOptions);
expectType<(request: Request) => Promise<Response>>(handler);

const handlerResult = handler(new Request('https://app.test'));
expectType<Promise<Response>>(handlerResult);

const fetched = fetchRoomfulToken('/api/roomful');
expectType<Promise<string>>(fetched);

const fetchedWithInit = fetchRoomfulToken('/api/roomful', { method: 'POST' });
expectType<Promise<string>>(fetchedWithInit);

// The fetched token is usable as the core client's relayAuth.
expectAssignable<RelayAuthToken>(await fetched);
