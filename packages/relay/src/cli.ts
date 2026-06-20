#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createRelayServer, type RelayServer } from './server.js';

const RELAY_CLI_HELP = `Usage: cahoots-relay [options]

Options:
  --port <number>             Port to listen on (default: 8787)
  --host <address>            Host interface to bind (default: 127.0.0.1)
  --max-connections <number>  Maximum concurrent WebSocket connections
  --redis-url <url>           Redis URL for multi-instance coordination
  --version                   Show the package version
  --help                      Show this help message

Environment:
  PORT (or CAHOOTS_PORT)
  HOST
  MAX_CONNECTIONS
  CAHOOTS_MAX_ROOM_SIZE
  CAHOOTS_CORS_ORIGIN
  CAHOOTS_AUTH_SECRET
  CAHOOTS_REDIS_URL
`;

interface RelayCliStdStream {
  write(chunk: string): void;
}

interface RelayCliProcessLike {
  argv?: string[];
  env: NodeJS.ProcessEnv;
  stdout: RelayCliStdStream;
  stderr: RelayCliStdStream;
  exitCode?: number;
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void;
}

interface RelayCliRuntime {
  createServer?: (options: {
    port: number;
    host?: string;
    maxConnections?: number;
    redisUrl?: string;
    maxRoomSize?: number;
    corsOrigin?: string;
    authSecret?: string;
  }) => RelayServer;
  process?: RelayCliProcessLike;
}

function parsePositiveIntegerOption(
  value: string | undefined,
  name: 'PORT' | 'MAX_CONNECTIONS' | 'CAHOOTS_MAX_ROOM_SIZE' | '--port' | '--max-connections',
): number | { error: string } | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return {
      error: `Invalid ${name} value "${value}".`,
    };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      error: `Invalid ${name} value "${value}".`,
    };
  }

  return parsed;
}

function parseRedisUrlOption(
  value: string | undefined,
  name: 'CAHOOTS_REDIS_URL' | '--redis-url',
): string | { error: string } | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      return {
        error: `Invalid ${name} value "${value}".`,
      };
    }
  } catch {
    return {
      error: `Invalid ${name} value "${value}".`,
    };
  }

  return value;
}

function readParsedStringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNonEmptyEnv(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRelayPackageVersion(): string {
  try {
    const packageJson: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    return typeof packageJson === 'object' &&
      packageJson !== null &&
      'version' in packageJson &&
      typeof packageJson.version === 'string'
      ? packageJson.version
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

function parseRelayCliArgs(argv: readonly string[]):
  | {
      help: boolean;
      host?: string;
      maxConnections?: string;
      port?: string;
      redisUrl?: string;
      version: boolean;
    }
  | { error: string } {
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        help: {
          type: 'boolean',
        },
        version: {
          type: 'boolean',
        },
        host: {
          type: 'string',
        },
        'max-connections': {
          type: 'string',
        },
        port: {
          type: 'string',
        },
        'redis-url': {
          type: 'string',
        },
      },
    });

    const host = readParsedStringValue(parsed.values.host);
    const maxConnections = readParsedStringValue(parsed.values['max-connections']);
    const port = readParsedStringValue(parsed.values.port);
    const redisUrl = readParsedStringValue(parsed.values['redis-url']);

    const result: {
      help: boolean;
      host?: string;
      maxConnections?: string;
      port?: string;
      redisUrl?: string;
      version: boolean;
    } = {
      help: parsed.values.help ?? false,
      version: parsed.values.version ?? false,
    };

    if (host !== undefined) {
      result.host = host;
    }
    if (maxConnections !== undefined) {
      result.maxConnections = maxConnections;
    }
    if (port !== undefined) {
      result.port = port;
    }
    if (redisUrl !== undefined) {
      result.redisUrl = redisUrl;
    }

    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown relay CLI argument parsing failure.',
    };
  }
}

export function resolveRelayCliOptions(
  env: NodeJS.ProcessEnv,
  argv: readonly string[] = [],
):
  | { helpText: string }
  | { versionText: string }
  | {
      port: number;
      host?: string;
      maxConnections?: number;
      redisUrl?: string;
      maxRoomSize?: number;
      corsOrigin?: string;
      authSecret?: string;
    }
  | { error: string } {
  const parsedArgs = parseRelayCliArgs(argv);
  if ('error' in parsedArgs) {
    return parsedArgs;
  }

  if (parsedArgs.help) {
    return {
      helpText: RELAY_CLI_HELP,
    };
  }

  if (parsedArgs.version) {
    return {
      versionText: `cahoots-relay ${readRelayPackageVersion()}\n`,
    };
  }

  const portFlag = parsePositiveIntegerOption(parsedArgs.port, '--port');
  if (typeof portFlag === 'object') {
    return portFlag;
  }

  const portEnv = parsePositiveIntegerOption(env.CAHOOTS_PORT ?? env.PORT, 'PORT');
  if (typeof portEnv === 'object') {
    return portEnv;
  }

  const maxConnectionsFlag = parsePositiveIntegerOption(
    parsedArgs.maxConnections,
    '--max-connections',
  );
  if (typeof maxConnectionsFlag === 'object') {
    return maxConnectionsFlag;
  }

  const maxConnectionsEnv = parsePositiveIntegerOption(env.MAX_CONNECTIONS, 'MAX_CONNECTIONS');
  if (typeof maxConnectionsEnv === 'object') {
    return maxConnectionsEnv;
  }

  const redisUrlFlag = parseRedisUrlOption(parsedArgs.redisUrl, '--redis-url');
  if (typeof redisUrlFlag === 'object') {
    return redisUrlFlag;
  }

  const redisUrlEnv = parseRedisUrlOption(env.CAHOOTS_REDIS_URL, 'CAHOOTS_REDIS_URL');
  if (typeof redisUrlEnv === 'object') {
    return redisUrlEnv;
  }

  const maxRoomSizeEnv = parsePositiveIntegerOption(
    env.CAHOOTS_MAX_ROOM_SIZE,
    'CAHOOTS_MAX_ROOM_SIZE',
  );
  if (typeof maxRoomSizeEnv === 'object') {
    return maxRoomSizeEnv;
  }

  const host = parsedArgs.host ?? env.HOST;
  const corsOrigin = readNonEmptyEnv(env.CAHOOTS_CORS_ORIGIN);
  const authSecret = readNonEmptyEnv(env.CAHOOTS_AUTH_SECRET);
  const resolvedPort = portFlag ?? portEnv ?? 8787;
  const resolvedMaxConnections = maxConnectionsFlag ?? maxConnectionsEnv;
  const resolvedRedisUrl = redisUrlFlag ?? redisUrlEnv;

  const options: {
    port: number;
    host?: string;
    maxConnections?: number;
    redisUrl?: string;
    maxRoomSize?: number;
    corsOrigin?: string;
    authSecret?: string;
  } = { port: resolvedPort };
  if (host !== undefined) {
    options.host = host;
  }
  if (resolvedMaxConnections !== undefined) {
    options.maxConnections = resolvedMaxConnections;
  }
  if (resolvedRedisUrl !== undefined) {
    options.redisUrl = resolvedRedisUrl;
  }
  if (maxRoomSizeEnv !== undefined) {
    options.maxRoomSize = maxRoomSizeEnv;
  }
  if (corsOrigin !== undefined) {
    options.corsOrigin = corsOrigin;
  }
  if (authSecret !== undefined) {
    options.authSecret = authSecret;
  }

  return options;
}

export async function runRelayCli(runtime: RelayCliRuntime = {}): Promise<number> {
  const processLike = runtime.process ?? process;
  const resolved = resolveRelayCliOptions(processLike.env, processLike.argv?.slice(2) ?? []);
  if ('helpText' in resolved) {
    processLike.stdout.write(resolved.helpText);
    return 0;
  }

  if ('versionText' in resolved) {
    processLike.stdout.write(resolved.versionText);
    return 0;
  }

  if ('error' in resolved) {
    processLike.stderr.write(`${resolved.error}\n`);
    return 1;
  }

  const createServer = runtime.createServer ?? createRelayServer;

  try {
    const server = createServer(resolved);
    await server.start();
    processLike.stdout.write(`Relay signaling server listening at ${server.getAddress()}\n`);

    const shutdown = (): void => {
      void server.stop().then(
        () => {
          processLike.exitCode = 0;
        },
        () => {
          processLike.exitCode = 1;
        },
      );
    };

    processLike.on('SIGINT', shutdown);
    processLike.on('SIGTERM', shutdown);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown relay CLI failure.';
    processLike.stderr.write(`${message}\n`);
    return 1;
  }
}

function isExecutedDirectly(): boolean {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    return false;
  }

  return fileURLToPath(import.meta.url) === scriptPath;
}

async function runRelayCliEntrypoint(): Promise<void> {
  process.exitCode = await runRelayCli();
}

if (isExecutedDirectly()) {
  void runRelayCliEntrypoint();
}
