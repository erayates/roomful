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
      '@roomful/cloud-api': resolve(workspaceRoot, 'packages/cloud-api/src'),
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
