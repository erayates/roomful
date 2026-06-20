import { expectType } from 'tsd';

import {
  createRelayServer,
  RelayJwtVerificationError,
  verifyJWT,
  type RelayAuthHandler,
  type RelayAuthorizeContext,
  type RelayJwtPayload,
  type RelayServer,
  type RelayServerOptions,
} from '@cahoots/relay';

const authHandler: RelayAuthHandler = async (peerId, roomId, token) => {
  expectType<string>(peerId);
  expectType<string>(roomId);
  expectType<string>(token);
  return true;
};

const options: RelayServerOptions = {
  authorize(context: RelayAuthorizeContext) {
    expectType<string>(context.peerId);
    expectType<string>(context.roomId);
    expectType<string | undefined>(context.token);
    return true;
  },
  port: 8787,
};
expectType<RelayServerOptions>(options);

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
expectType<string>(server.getAddress());
expectType<Promise<void>>(server.start());
expectType<Promise<void>>(server.stop());

const chainedServer = server.auth(authHandler);
expectType<RelayServer>(chainedServer);

const verificationError = new RelayJwtVerificationError('invalid token');
expectType<RelayJwtVerificationError>(verificationError);

expectType<RelayJwtPayload>(verifyJWT('header.payload.signature', 'secret'));
