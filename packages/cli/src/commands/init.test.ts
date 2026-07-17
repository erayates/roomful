import { describe, expect, test } from 'vitest';

import type { RoomfulCliRuntime } from '../cli.js';
import { runInit } from './init.js';

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

describe('runInit', () => {
  test('prints help with --help', () => {
    const rt = runtime();
    const code = runInit(['--help'], rt);
    expect(code).toBe(0);
    expect(rt.output).toContain('Usage: roomful init');
  });

  test('fails with unknown option', () => {
    const rt = runtime();
    const code = runInit(['--unknown'], rt);
    expect(code).toBe(1);
    expect(rt.errors).toContain('Unknown option');
  });
});
