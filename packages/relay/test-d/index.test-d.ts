import { expectType } from 'tsd';

import {
  createRelayServer,
  RelayJwtVerificationError,
  verifyJWT,
  type RelayAuthorizeContext,
  type RelayJwtPayload,
  type RelayServer,
} from '@flockjs/relay';

const server = createRelayServer({
  authorize(context: RelayAuthorizeContext) {
    expectType<string>(context.peerId);
    expectType<string>(context.roomId);
    return true;
  },
  port: 8787,
});

expectType<RelayServer>(server);
expectType<number>(server.port);

const chainedServer = server.auth(async (peerId, roomId, token) => {
  expectType<string>(peerId);
  expectType<string>(roomId);
  expectType<string>(token);
  return true;
});
expectType<RelayServer>(chainedServer);

const verificationError = new RelayJwtVerificationError('invalid token');
expectType<RelayJwtVerificationError>(verificationError);

expectType<RelayJwtPayload>(verifyJWT('header.payload.signature', 'secret'));
