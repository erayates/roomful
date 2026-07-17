import { describe, expect, test } from 'vitest';

import type { RoomfulCliRuntime } from './cli.js';
import { runRoomfulCli } from './cli.js';

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

describe('runRoomfulCli', () => {
  test('prints help when no command given', async () => {
    const rt = runtime();
    rt.argv = [];
    const code = await runRoomfulCli(rt);
    expect(code).toBe(0);
    expect(rt.output).toContain('Usage: roomful');
  });

  test('prints version with version command', async () => {
    const rt = runtime();
    rt.argv = ['version'];
    const code = await runRoomfulCli(rt);
    expect(code).toBe(0);
    expect(rt.output).toContain('roomful ');
  });

  test('errors on unknown command', async () => {
    const rt = runtime();
    rt.argv = ['nonexistent'];
    const code = await runRoomfulCli(rt);
    expect(code).toBe(1);
    expect(rt.errors).toContain('Unknown command');
  });

  test('demo command prints instructions', async () => {
    const rt = runtime();
    rt.argv = ['demo'];
    const code = await runRoomfulCli(rt);
    expect(code).toBe(0);
    expect(rt.output).toContain('demo.roomful.dev');
  });

  test('inspect requires room ID', async () => {
    const rt = runtime();
    rt.argv = ['inspect'];
    const code = await runRoomfulCli(rt);
    expect(code).toBe(1);
    expect(rt.errors).toContain('room ID is required');
  });
});
