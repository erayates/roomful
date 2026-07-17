import type { RoomfulCliRuntime } from '../cli.js';

const DOCTOR_HELP = `Usage: roomful doctor [options]

Validate your Roomful setup:
  - Check @roomful/core is installed and importable
  - Verify relay URL reachability
  - Check environment configuration

Options:
  --relay <url>   Relay URL to check (default: ROOMFUL_RELAY_URL env or ws://127.0.0.1:8787)
  --help, -h      Show this help message

Environment:
  ROOMFUL_RELAY_URL   Default relay URL
`;

interface DoctorResult {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

function statusIcon(status: DoctorResult['status']): string {
  switch (status) {
    case 'pass':
      return '\u2713';
    case 'fail':
      return '\u2717';
    case 'warn':
      return '\u26A0';
  }
}

function parseDoctorArgs(args: string[]): { relayUrl: string | undefined } | { error: string } {
  let i = 0;
  let relayUrl: string | undefined;

  while (i < args.length) {
    const arg = args[i] ?? '';
    if (arg === '--help' || arg === '-h') {
      return { relayUrl: undefined };
    }
    if (arg === '--relay' && i + 1 < args.length) {
      relayUrl = args[i + 1];
      i += 2;
      continue;
    }
    if (arg.startsWith('--relay=')) {
      relayUrl = arg.slice('--relay='.length);
      i += 1;
      continue;
    }
    return { error: `Unknown option: ${arg}` };
  }

  return { relayUrl };
}

function checkNodeVersion(): DoctorResult {
  const version = process.versions.node;
  const major = parseInt(version.split('.')[0] ?? '0', 10);
  if (major >= 20) {
    return { label: 'Node.js version', status: 'pass', detail: `v${version} (>=20 required)` };
  }
  return { label: 'Node.js version', status: 'fail', detail: `v${version} (>=20 required)` };
}

function checkCoreInstalled(): DoctorResult {
  try {
    import.meta.resolve('@roomful/core', import.meta.url);
    return { label: '@roomful/core', status: 'pass', detail: 'resolved' };
  } catch {
    return {
      label: '@roomful/core',
      status: 'warn',
      detail: 'Not found in current project. Install with: npm install @roomful/core',
    };
  }
}

function checkEnvVars(): DoctorResult[] {
  const results: DoctorResult[] = [];
  const relayUrl = process.env['ROOMFUL_RELAY_URL'];

  if (relayUrl) {
    results.push({
      label: 'ROOMFUL_RELAY_URL',
      status: 'pass',
      detail: relayUrl,
    });
  } else {
    results.push({
      label: 'ROOMFUL_RELAY_URL',
      status: 'warn',
      detail: 'Not set. Default relay is ws://127.0.0.1:8787',
    });
  }

  return results;
}

async function checkRelayReachable(url: string): Promise<DoctorResult> {
  try {
    const wsUrl = url.startsWith('ws') ? url : url.replace(/^http/, 'ws');
    const httpUrl = wsUrl.replace(/^ws/, 'http').replace(/\/$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    try {
      const response = await fetch(`${httpUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        return {
          label: 'Relay reachability',
          status: 'pass',
          detail: `${httpUrl}/health responded ${response.status}`,
        };
      }
      return {
        label: 'Relay reachability',
        status: 'warn',
        detail: `${httpUrl}/health responded ${response.status}`,
      };
    } catch {
      clearTimeout(timeout);
      return {
        label: 'Relay reachability',
        status: 'fail',
        detail: `Could not reach ${httpUrl}/health. Is the relay running?`,
      };
    }
  } catch {
    return {
      label: 'Relay reachability',
      status: 'fail',
      detail: `Invalid URL: ${url}`,
    };
  }
}

export async function runDoctor(args: string[], runtime: RoomfulCliRuntime): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    runtime.stdout.write(DOCTOR_HELP);
    return 0;
  }

  const parsed = parseDoctorArgs(args);
  if ('error' in parsed) {
    runtime.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const relayUrl = parsed.relayUrl ?? process.env['ROOMFUL_RELAY_URL'] ?? 'ws://127.0.0.1:8787';

  runtime.stdout.write('Roomful Doctor\n');
  runtime.stdout.write(
    '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n\n',
  );

  const results: DoctorResult[] = [
    checkNodeVersion(),
    checkCoreInstalled(),
    ...checkEnvVars(),
    await checkRelayReachable(relayUrl),
  ];

  let failed = 0;
  for (const result of results) {
    runtime.stdout.write(`  ${statusIcon(result.status)} ${result.label}: ${result.detail}\n`);
    if (result.status === 'fail') {
      failed++;
    }
  }

  runtime.stdout.write('\n');
  if (failed > 0) {
    runtime.stdout.write(`${failed} check(s) failed.\n`);
    return 1;
  }

  runtime.stdout.write('All checks passed.\n');
  return 0;
}
