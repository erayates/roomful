import path from 'node:path';

import { defineConfig } from 'vite';

const integrationDir = path.resolve(__dirname);
const repoRoot = path.resolve(integrationDir, '../../..');
const fixtureDir = path.resolve(integrationDir, 'fixture');

export default defineConfig({
  root: fixtureDir,
  resolve: {
    alias: {
      '@cahoots/core': path.resolve(repoRoot, 'packages/core/src/index.ts'),
      '@cahoots/react-local': path.resolve(repoRoot, 'packages/react/src/index.ts'),
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
});
