import { createRelayServer, type RelayServer } from './server';

interface RelayCliStdStream {
  write(chunk: string): void;
}

interface RelayCliProcessLike {
  env: NodeJS.ProcessEnv;
  stdout: RelayCliStdStream;
  stderr: RelayCliStdStream;
  exitCode?: number;
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void;
}

interface RelayCliRuntime {
  createServer?: (options: { port: number; host?: string; maxConnections?: number }) => RelayServer;
  process?: RelayCliProcessLike;
}

function parsePositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: 'PORT' | 'MAX_CONNECTIONS',
): number | { error: string } | undefined {
  const value = env[name];
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

export function resolveRelayCliOptions(
  env: NodeJS.ProcessEnv,
): { port: number; host?: string; maxConnections?: number } | { error: string } {
  const port = parsePositiveIntegerEnv(env, 'PORT');
  if (typeof port === 'object') {
    return port;
  }

  const maxConnections = parsePositiveIntegerEnv(env, 'MAX_CONNECTIONS');
  if (typeof maxConnections === 'object') {
    return maxConnections;
  }

  const host = env.HOST;
  const resolvedPort = typeof port === 'number' ? port : 8787;
  return host === undefined
    ? {
        port: resolvedPort,
        ...(typeof maxConnections === 'number' ? { maxConnections } : {}),
      }
    : {
        port: resolvedPort,
        host,
        ...(typeof maxConnections === 'number' ? { maxConnections } : {}),
      };
}

export async function runRelayCli(runtime: RelayCliRuntime = {}): Promise<number> {
  const processLike = runtime.process ?? process;
  const resolved = resolveRelayCliOptions(processLike.env);
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
