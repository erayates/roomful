import { execSync } from 'node:child_process';

import type { RoomfulCliRuntime } from '../cli.js';

const DEMO_HELP = `Usage: roomful demo [options]

Launch the Roomful demo app.

Options:
  --local          Run the demo from the local monorepo
  --open           Open the demo URL in the default browser (default)
  --url <url>      Custom demo URL
  --help, -h       Show this help message
`;

interface DemoOptions {
  local: boolean;
  open: boolean;
  url: string;
}

function parseDemoArgs(args: string[]): DemoOptions | { error: string } {
  const options: DemoOptions = { local: false, open: true, url: 'https://demo.roomful.dev' };

  let i = 0;
  while (i < args.length) {
    const arg = args[i] ?? '';
    if (arg === '--help' || arg === '-h') {
      return options;
    }
    if (arg === '--local') {
      options.local = true;
      i += 1;
      continue;
    }
    if (arg === '--open') {
      options.open = true;
      i += 1;
      continue;
    }
    if (arg === '--no-open') {
      options.open = false;
      i += 1;
      continue;
    }
    if (arg === '--url' && i + 1 < args.length) {
      options.url = args[i + 1] ?? 'https://demo.roomful.dev';
      i += 2;
      continue;
    }
    if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
      i += 1;
      continue;
    }
    return { error: `Unknown option: ${arg}` };
  }

  return options;
}

function openBrowser(url: string): void {
  try {
    const cmd =
      process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
          ? `open "${url}"`
          : `xdg-open "${url}"`;
    execSync(cmd, { timeout: 5000, stdio: 'ignore' });
  } catch {
    // Browser open failed silently
  }
}

export async function runDemo(args: string[], runtime: RoomfulCliRuntime): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    runtime.stdout.write(DEMO_HELP);
    return 0;
  }

  const parsed = parseDemoArgs(args);

  if ('error' in parsed) {
    runtime.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  if (parsed.local) {
    runtime.stdout.write('Starting Roomful demo from local monorepo...\n');
    runtime.stdout.write('  pnpm --filter @roomful/app-demo dev\n\n');
    runtime.stdout.write('Or open the hosted version:\n');
    runtime.stdout.write(`  ${parsed.url}\n`);
    return 0;
  }

  runtime.stdout.write(`Roomful Demo: ${parsed.url}\n`);
  if (parsed.open) {
    runtime.stdout.write('Opening in browser...\n');
    openBrowser(parsed.url);
  }

  return 0;
}

export { parseDemoArgs };
