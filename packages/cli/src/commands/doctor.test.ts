import { describe, expect, test } from 'vitest';

import type { RoomfulCliRuntime } from '../cli.js';
import { runDoctor } from './doctor.js';

function runtime(): RoomfulCliRuntime & { output: string; errors: string } {
  const r = {
    output: '',
    errors: '',
    stdout: {
      write(chunk: string) {
        r.output += chunk;
      },
    },
    stderr: {
      write(chunk: string) {
        r.errors += chunk;
      },
    },
  };
  return r;
}

describe('runDoctor', () => {
  test('prints help with --help', async () => {
    const rt = runtime();
    const code = await runDoctor(['--help'], rt);
    expect(code).toBe(0);
    expect(rt.output).toContain('Usage: roomful doctor');
  });

  test('runs checks and reports results', async () => {
    const rt = runtime();
    const code = await runDoctor([], rt);
    expect(typeof code).toBe('number');
    expect(rt.output).toContain('Roomful Doctor');
    expect(rt.output).toContain('Node.js version');
  });
});
