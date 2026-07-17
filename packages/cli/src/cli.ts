#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';

const ROOMFUL_CLI_HELP = `Usage: roomful <command> [options]

Commands:
  init [dir]       Scaffold a new Roomful project
  doctor           Validate config, relay reachability, and auth
  demo             Launch the Roomful demo app
  inspect <room>   Inspect a live Roomful room
  help             Show this help message
  version          Show the CLI version

Options:
  --help, -h       Show help for a command

Environment:
  ROOMFUL_RELAY_URL   Default relay URL (used by doctor, demo, inspect)
`;

export { runDoctor } from './commands/doctor.js';
export { runInit } from './commands/init.js';

export interface RoomfulCliStdStream {
  write(chunk: string): void;
}

export interface RoomfulCliRuntime {
  argv?: string[];
  stdout: RoomfulCliStdStream;
  stderr: RoomfulCliStdStream;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPackageVersion(): string {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    if (isRecord(raw) && typeof raw.version === 'string') {
      return raw.version;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function runRoomfulCli(
  runtime: RoomfulCliRuntime = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const argv = runtime.argv ?? process.argv.slice(2);
  const command = argv[0];
  const args = argv.slice(1);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    runtime.stdout.write(ROOMFUL_CLI_HELP);
    return 0;
  }

  if (command === 'version' || command === '--version') {
    runtime.stdout.write(`roomful ${readPackageVersion()}\n`);
    return 0;
  }

  switch (command) {
    case 'init':
      return runInit(args, runtime);
    case 'doctor':
      return runDoctor(args, runtime);
    case 'demo':
      runtime.stdout.write(
        'demo: The Roomful demo app is at https://demo.roomful.dev.\n' +
          'To run locally, clone the repo and run:\n' +
          '  pnpm --filter @roomful/app-demo dev\n',
      );
      return 0;
    case 'inspect': {
      const roomId = args[0];
      if (!roomId) {
        runtime.stderr.write('inspect: A room ID is required. Usage: roomful inspect <roomId>\n');
        return 1;
      }
      runtime.stdout.write(
        `inspect: Connecting to room "${roomId}"...\n` +
          'Room Inspector is available in @roomful/devtools.\n' +
          'See https://docs.roomful.dev/reference/devtools-debugging\n',
      );
      return 0;
    }
    default:
      runtime.stderr.write(`Unknown command: ${command}\nRun 'roomful help' for usage.\n`);
      return 1;
  }
}

function isExecutedDirectly(): boolean {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(modulePath) === realpathSync(scriptPath);
  } catch {
    return modulePath === scriptPath;
  }
}

if (isExecutedDirectly()) {
  void runRoomfulCli().then((code) => {
    process.exitCode = code;
  });
}
