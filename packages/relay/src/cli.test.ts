import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { resolveRelayCliOptions, runRelayCli } from './cli.js';
import type { RelayServer } from './server.js';

interface FakeProcess {
  argv?: string[];
  env: NodeJS.ProcessEnv;
  stdout: {
    write: ReturnType<typeof vi.fn<(chunk: string) => void>>;
  };
  stderr: {
    write: ReturnType<typeof vi.fn<(chunk: string) => void>>;
  };
  exitCode?: number;
  on(signal: 'SIGINT' | 'SIGTERM', listener: () => void): void;
}

function createFakeProcess(
  env: NodeJS.ProcessEnv,
  argv: string[] = [],
): {
  processLike: FakeProcess;
  signalHandlers: Map<'SIGINT' | 'SIGTERM', () => void>;
} {
  const signalHandlers = new Map<'SIGINT' | 'SIGTERM', () => void>();
  const processLike: FakeProcess = {
    argv,
    env,
    stdout: {
      write: vi.fn<(chunk: string) => void>(),
    },
    stderr: {
      write: vi.fn<(chunk: string) => void>(),
    },
    on(signal, listener) {
      signalHandlers.set(signal, listener);
    },
  };

  return {
    processLike,
    signalHandlers,
  };
}

function readExpectedRelayPackageVersion(): string {
  const packageJson: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );

  if (
    typeof packageJson !== 'object' ||
    packageJson === null ||
    !('version' in packageJson) ||
    typeof packageJson.version !== 'string'
  ) {
    throw new Error('Expected relay package.json to contain a string version.');
  }

  return packageJson.version;
}

describe('relay cli', () => {
  it('returns an error result for invalid ports', () => {
    expect(
      resolveRelayCliOptions(
        {
          PORT: 'invalid',
        },
        [],
      ),
    ).toEqual({
      error: 'Invalid PORT value "invalid".',
    });
  });

  it('returns an error result for invalid max connections', () => {
    expect(
      resolveRelayCliOptions(
        {
          MAX_CONNECTIONS: 'invalid',
        },
        [],
      ),
    ).toEqual({
      error: 'Invalid MAX_CONNECTIONS value "invalid".',
    });
  });

  it('returns an error result for invalid redis urls', () => {
    expect(
      resolveRelayCliOptions(
        {
          FLOCK_REDIS_URL: 'not-a-url',
        },
        [],
      ),
    ).toEqual({
      error: 'Invalid FLOCK_REDIS_URL value "not-a-url".',
    });
  });

  it('resolves valid port, host, and max connection values', () => {
    expect(
      resolveRelayCliOptions(
        {
          PORT: '8788',
          HOST: '0.0.0.0',
          MAX_CONNECTIONS: '250',
          FLOCK_REDIS_URL: 'redis://127.0.0.1:6379/0',
        },
        [],
      ),
    ).toEqual({
      port: 8788,
      host: '0.0.0.0',
      maxConnections: 250,
      redisUrl: 'redis://127.0.0.1:6379/0',
    });

    expect(resolveRelayCliOptions({}, [])).toEqual({
      port: 8787,
    });
  });

  it('prefers cli flags over environment variables', () => {
    expect(
      resolveRelayCliOptions(
        {
          PORT: '8787',
          HOST: '127.0.0.1',
          MAX_CONNECTIONS: '100',
          FLOCK_REDIS_URL: 'redis://127.0.0.1:6379/0',
        },
        ['--port', '8080', '--host', '0.0.0.0', '--max-connections', '200'],
      ),
    ).toEqual({
      port: 8080,
      host: '0.0.0.0',
      maxConnections: 200,
      redisUrl: 'redis://127.0.0.1:6379/0',
    });
  });

  it('returns an error result for invalid cli flag values', () => {
    expect(resolveRelayCliOptions({}, ['--port', 'invalid'])).toEqual({
      error: 'Invalid --port value "invalid".',
    });
  });

  it('writes cli validation failures to stderr and returns a non-zero exit code', async () => {
    const { processLike } = createFakeProcess({
      PORT: 'not-a-number',
    });

    await expect(
      runRelayCli({
        process: processLike,
      }),
    ).resolves.toBe(1);
    expect(processLike.stderr.write).toHaveBeenCalledWith('Invalid PORT value "not-a-number".\n');
  });

  it('prints help output without starting the relay', async () => {
    const createServer = vi.fn();
    const { processLike } = createFakeProcess({}, ['node', 'flockjs-relay', '--help']);

    await expect(
      runRelayCli({
        createServer,
        process: processLike,
      }),
    ).resolves.toBe(0);

    expect(createServer).not.toHaveBeenCalled();
    expect(processLike.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('Usage: flockjs-relay [options]'),
    );
  });

  it('prints the package version without starting the relay', async () => {
    const createServer = vi.fn();
    const { processLike } = createFakeProcess({}, ['node', 'flockjs-relay', '--version']);

    await expect(
      runRelayCli({
        createServer,
        process: processLike,
      }),
    ).resolves.toBe(0);

    expect(createServer).not.toHaveBeenCalled();
    expect(processLike.stdout.write).toHaveBeenCalledWith(
      `flockjs-relay ${readExpectedRelayPackageVersion()}\n`,
    );
  });

  it('starts the relay and stops it on shutdown without calling process.exit', async () => {
    const start = vi.fn(async (): Promise<void> => {
      return undefined;
    });
    const stop = vi.fn(async (): Promise<void> => {
      return undefined;
    });
    const createServer = vi.fn(
      (): RelayServer => ({
        port: 8788,
        start,
        stop,
        getAddress() {
          return 'ws://relay.local:8788';
        },
      }),
    );

    const { processLike, signalHandlers } = createFakeProcess(
      {
        PORT: '8788',
        HOST: '127.0.0.1',
        MAX_CONNECTIONS: '42',
        FLOCK_REDIS_URL: 'redis://127.0.0.1:6379/0',
      },
      ['node', 'flockjs-relay'],
    );

    await expect(
      runRelayCli({
        createServer,
        process: processLike,
      }),
    ).resolves.toBe(0);

    expect(createServer).toHaveBeenCalledWith({
      port: 8788,
      host: '127.0.0.1',
      maxConnections: 42,
      redisUrl: 'redis://127.0.0.1:6379/0',
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(processLike.stdout.write).toHaveBeenCalledWith(
      'Relay signaling server listening at ws://relay.local:8788\n',
    );
    expect(signalHandlers.has('SIGINT')).toBe(true);
    expect(signalHandlers.has('SIGTERM')).toBe(true);

    signalHandlers.get('SIGINT')?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(processLike.exitCode).toBe(0);
  });

  it('resolves the documented FLOCK_* environment variables', () => {
    const resolved = resolveRelayCliOptions(
      {
        FLOCK_PORT: '9000',
        FLOCK_MAX_ROOM_SIZE: '200',
        FLOCK_CORS_ORIGIN: 'https://app.example.com',
        FLOCK_AUTH_SECRET: 'top-secret',
      },
      [],
    );

    expect(resolved).toEqual({
      port: 9000,
      maxRoomSize: 200,
      corsOrigin: 'https://app.example.com',
      authSecret: 'top-secret',
    });
  });

  it('prefers an explicit --port flag over FLOCK_PORT and PORT', () => {
    const resolved = resolveRelayCliOptions(
      {
        FLOCK_PORT: '9000',
        PORT: '8000',
      },
      ['--port', '7000'],
    );

    expect(resolved).toMatchObject({
      port: 7000,
    });
  });
});
