import solid from 'vite-plugin-solid';
import { mergeConfig } from 'vitest/config';

import packageConfig from '../../vitest.package.config';

export default mergeConfig(packageConfig, {
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    server: {
      deps: {
        inline: [/solid-js/, /@solidjs\/testing-library/],
      },
    },
  },
});
