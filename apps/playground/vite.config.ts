import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@roomful/core': resolve(workspaceRoot, 'packages/core/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4175,
  },
  preview: {
    host: '127.0.0.1',
    port: 4175,
  },
});
