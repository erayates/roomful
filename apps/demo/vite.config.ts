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
      '@flockjs/core': resolve(workspaceRoot, 'packages/core/src/index.ts'),
      '@flockjs/cursors': resolve(workspaceRoot, 'packages/cursors/src/index.ts'),
      '@flockjs/devtools': resolve(workspaceRoot, 'packages/devtools/src/index.ts'),
      '@flockjs/react': resolve(workspaceRoot, 'packages/react/src/index.ts'),
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
