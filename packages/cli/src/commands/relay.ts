import type { RelayDefaults, RelayServerOptions } from '@roomful/relay';
import { createRelayServer } from '@roomful/relay';

import type { RoomfulCliRuntime } from '../cli.js';

const RELAY_HELP = `Usage: roomful relay <command> [options]

Start and manage a local Roomful relay server.

Commands:
  start              Start a relay server (default)
  help               Show this help message

Options for start:
  --port <number>    Listening port (default: 8787)
  --host <address>   Listening host (default: 127.0.0.1)
  --max-connections  Max concurrent peer connections
  --max-room-size    Max peers per room
  --auth-secret      JWT signing secret for token auth
  --cors-origin      Allowed CORS origin
  --management-api   Enable REST management API at /api/v1
  --help, -h         Show help for a command

Examples:
  roomful relay start
  roomful relay start --port 8080 --cors-origin "*"
  roomful relay start --port 8080 --management-api
  
Environment:
  ROOMFUL_RELAY_URL   Default relay URL used by doctor and inspect
`;

interface RelayStartOptions {
  port: number;
  host: string;
  maxConnections?: number;
  maxRoomSize?: number;
  authSecret?: string;
  corsOrigin?: string;
  managementApi: boolean;
}

export function parseRelayArgs(
  args: string[],
): { command: string; options: RelayStartOptions } | { error: string } {
  if (args[0] === '--help' || args[0] === '-h') {
    return { command: 'help', options: { port: 8787, host: '127.0.0.1', managementApi: false } };
  }

  const command = args[0] ?? 'start';
  const options: RelayStartOptions = { port: 8787, host: '127.0.0.1', managementApi: false };

  // Parse global options from args[1:]
  const opts = args.slice(command === 'start' ? 1 : 0);
  let i = 0;
  while (i < opts.length) {
    const arg = opts[i] ?? '';
    if (arg === '--port' && i + 1 < opts.length) {
      options.port = parseInt(opts[i + 1] ?? '8787', 10);
      i += 2;
      continue;
    }
    if (arg.startsWith('--port=')) {
      options.port = parseInt(arg.slice('--port='.length), 10);
      i += 1;
      continue;
    }
    if (arg === '--host' && i + 1 < opts.length) {
      options.host = opts[i + 1] ?? '127.0.0.1';
      i += 2;
      continue;
    }
    if (arg.startsWith('--host=')) {
      options.host = arg.slice('--host='.length);
      i += 1;
      continue;
    }
    if (arg === '--max-connections' && i + 1 < opts.length) {
      options.maxConnections = parseInt(opts[i + 1] ?? '0', 10);
      i += 2;
      continue;
    }
    if (arg === '--max-room-size' && i + 1 < opts.length) {
      options.maxRoomSize = parseInt(opts[i + 1] ?? '0', 10);
      i += 2;
      continue;
    }
    if (arg === '--auth-secret' && i + 1 < opts.length) {
      const val = opts[i + 1];
      if (val !== undefined) options.authSecret = val;
      i += 2;
      continue;
    }
    if (arg.startsWith('--auth-secret=')) {
      options.authSecret = arg.slice('--auth-secret='.length);
      i += 1;
      continue;
    }
    if (arg === '--cors-origin' && i + 1 < opts.length) {
      const val = opts[i + 1];
      if (val !== undefined) options.corsOrigin = val;
      i += 2;
      continue;
    }
    if (arg.startsWith('--cors-origin=')) {
      options.corsOrigin = arg.slice('--cors-origin='.length);
      i += 1;
      continue;
    }
    if (arg === '--management-api') {
      options.managementApi = true;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { command: 'help', options: { port: 8787, host: '127.0.0.1', managementApi: false } };
    }
    return { error: `Unknown option: ${arg}` };
  }

  return { command, options };
}

export async function runRelay(args: string[], runtime: RoomfulCliRuntime): Promise<number> {
  const parsed = parseRelayArgs(args);

  if ('error' in parsed) {
    runtime.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  if (parsed.command === 'help') {
    runtime.stdout.write(RELAY_HELP);
    return 0;
  }

  if (parsed.command !== 'start') {
    runtime.stderr.write(`Unknown relay subcommand: ${parsed.command}\n`);
    return 1;
  }

  const opts = parsed.options;

  const serverOptions: RelayServerOptions = {
    port: opts.port,
    host: opts.host,
  };

  if (opts.maxConnections !== undefined && opts.maxConnections > 0) {
    serverOptions.maxConnections = opts.maxConnections;
  }
  if (opts.maxRoomSize !== undefined && opts.maxRoomSize > 0) {
    serverOptions.maxRoomSize = opts.maxRoomSize;
  }
  if (opts.authSecret !== undefined) {
    serverOptions.authSecret = opts.authSecret;
  }
  if (opts.corsOrigin !== undefined) {
    serverOptions.corsOrigin = opts.corsOrigin;
  }

  // Enable management API with default limits
  if (opts.managementApi) {
    const defaults: RelayDefaults = {
      maxRooms: 100,
      maxPeersPerRoom: 250,
      maxTotalPeers: 10_000,
      messageRateLimit: 20,
      messageRateIntervalMs: 1_000,
      maxEphemeralTtlMs: 86_400_000,
      maxTotalStateBytes: 104_857_600,
    };

    serverOptions.managementApi = {
      prefix: '/api/v1',
      defaults,
    };
  }

  const server = createRelayServer(serverOptions);

  // Graceful shutdown
  const shutdown = (): void => {
    runtime.stdout.write('\nShutting down relay server...\n');
    void server.stop().then(() => {
      runtime.stdout.write('Relay server stopped.\n');
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await server.start();
    runtime.stdout.write(`Relay server listening on ws://${opts.host}:${opts.port}\n`);
    if (opts.managementApi) {
      runtime.stdout.write(`Management API at http://${opts.host}:${opts.port}/api/v1\n`);
    }
    runtime.stdout.write('Press Ctrl+C to stop.\n');

    // Keep alive
    await new Promise<never>(() => {
      /* never resolves — process stays alive */
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    runtime.stderr.write(`Failed to start relay server: ${message}\n`);
    return 1;
  }

  return 0;
}
