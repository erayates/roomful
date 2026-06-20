import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const exampleRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(exampleRoot, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@cahoots/core': resolve(workspaceRoot, 'packages/core/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4182,
  },
  preview: {
    host: '127.0.0.1',
    port: 4182,
  },
});
