import { RelayJwtVerificationError, verifyJWT } from './auth.js';
import { createRelayServer } from './server.js';

export { createRelayServer, RelayJwtVerificationError, verifyJWT };
export type { RelayJwtPayload } from './auth.js';
export type { RelayJwtClaims } from './edge-auth.js';
export { EdgeRelayJwtVerificationError, verifyRelayJwtEdge } from './edge-auth.js';
export type { EdgeConnection, EdgeRoomAuthorize, EdgeRoomOptions } from './edge-room.js';
export { EdgeRoom } from './edge-room.js';
export type {
  RelayAuthHandler,
  RelayAuthorizeContext,
  RelayServer,
  RelayServerOptions,
} from './server.js';
