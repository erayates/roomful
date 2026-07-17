import WebSocket from 'ws';

import type { RoomfulCliRuntime } from '../cli.js';

const INSPECT_HELP = `Usage: roomful inspect <roomId> [options]

Inspect a live Roomful room by connecting to a relay.

Options:
  --relay <url>    Relay URL (default: ROOMFUL_RELAY_URL env or ws://127.0.0.1:8787)
  --timeout <ms>   Connection timeout in milliseconds (default: 5000)
  --help, -h       Show this help message

Examples:
  roomful inspect my-room
  roomful inspect my-room --relay ws://relay.example.com:8787
  roomful inspect my-room --timeout 10000
`;

interface InspectOptions {
  relayUrl: string;
  timeout: number;
  roomId: string;
}

function parseInspectArgs(args: string[]): InspectOptions | { error: string } {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { error: 'A room ID is required. Usage: roomful inspect <roomId>' };
  }

  const options: InspectOptions = {
    roomId: args[0] ?? '',
    relayUrl: process.env['ROOMFUL_RELAY_URL'] ?? 'ws://127.0.0.1:8787',
    timeout: 5000,
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i] ?? '';
    if (arg === '--relay' && i + 1 < args.length) {
      options.relayUrl = args[i + 1] ?? options.relayUrl;
      i += 2;
      continue;
    }
    if (arg.startsWith('--relay=')) {
      options.relayUrl = arg.slice('--relay='.length);
      i += 1;
      continue;
    }
    if (arg === '--timeout' && i + 1 < args.length) {
      options.timeout = parseInt(args[i + 1] ?? '5000', 10);
      i += 2;
      continue;
    }
    if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.slice('--timeout='.length), 10);
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { error: 'Usage: roomful inspect <roomId> [options]\n\n' + INSPECT_HELP };
    }
    return { error: `Unknown option: ${arg}` };
  }

  return options;
}

export async function runInspect(args: string[], runtime: RoomfulCliRuntime): Promise<number> {
  const parsed = parseInspectArgs(args);

  if ('error' in parsed) {
    runtime.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const wsUrl = `${parsed.relayUrl.replace(/\/$/, '')}?token=inspect&roomId=${encodeURIComponent(parsed.roomId)}`;

  runtime.stdout.write(`Inspecting room "${parsed.roomId}" via ${parsed.relayUrl}...\n`);

  try {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: parsed.timeout });

    const result = await new Promise<number>((resolve) => {
      const timer = setTimeout(() => {
        ws.close();
        runtime.stderr.write('Connection timed out.\n');
        resolve(1);
      }, parsed.timeout);

      ws.on('open', () => {
        clearTimeout(timer);
        runtime.stdout.write('Connected to relay.\n');
        runtime.stdout.write('Room is active and accepting connections.\n');
        ws.close();
        resolve(0);
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timer);
        runtime.stderr.write(`Connection failed: ${err.message}\n`);
        resolve(1);
      });

      ws.on('close', (code: number) => {
        clearTimeout(timer);
        if (code !== 1000 && code !== 1005) {
          runtime.stderr.write(`Connection closed with code ${code}.\n`);
          resolve(1);
        }
      });
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    runtime.stderr.write(`Failed to connect: ${message}\n`);
    return 1;
  }
}

export { parseInspectArgs };
