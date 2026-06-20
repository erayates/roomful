import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, '../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cahoots/core': resolve(workspaceRoot, 'packages/core/src/index.ts'),
      '@cahoots/cursors': resolve(workspaceRoot, 'packages/cursors/src/index.ts'),
      '@cahoots/devtools': resolve(workspaceRoot, 'packages/devtools/src/index.ts'),
      '@cahoots/react': resolve(workspaceRoot, 'packages/react/src/index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
});
