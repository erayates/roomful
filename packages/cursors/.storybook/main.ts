import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.ts'],
  staticDirs: ['./public'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    defaultName: 'Reference',
  },
  typescript: {
    reactDocgen: false,
  },
  async viteFinal(existingConfig) {
    return mergeConfig(existingConfig, {
      base: './',
    });
  },
};

export default config;
