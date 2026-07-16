import type { RelayAuthToken } from '@roomful/core';
import {
  createRoomfulTokenRoute,
  fetchRoomfulToken,
  issueRoomfulToken,
  type RoomfulTokenAuthorizeResult,
} from '@roomful/next';

const authorize = async (): Promise<RoomfulTokenAuthorizeResult> => {
  return {
    claims: { role: 'editor' },
    roomId: 'publish-smoke-next',
    subject: 'peer-a',
  };
};

const handler = createRoomfulTokenRoute({
  authorize,
  secret: 'relay-secret',
});

const tokenPromise: Promise<RelayAuthToken> = issueRoomfulToken({
  roomId: 'publish-smoke-next',
  secret: 'relay-secret',
  subject: 'peer-a',
});

const summary = {
  fetchHelper: typeof fetchRoomfulToken === 'function',
  handler: typeof handler === 'function',
  tokenPromise: typeof tokenPromise.then === 'function',
};

const appElement = document.querySelector('#app');
if (appElement !== null) {
  appElement.textContent = JSON.stringify(summary, null, 2);
}
