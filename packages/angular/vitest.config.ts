import { mergeConfig } from 'vitest/config';

import packageConfig from '../../vitest.package.config';

export default mergeConfig(packageConfig, {
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: [/@angular/, /zone\.js/, /rxjs/],
      },
    },
  },
});
