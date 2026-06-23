import { fileURLToPath } from 'node:url';

import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightDocSearch from '@astrojs/starlight-docsearch';
import { defineConfig } from 'astro/config';

const hasDocSearch =
  Boolean(process.env.PUBLIC_DOCSEARCH_APP_ID) &&
  Boolean(process.env.PUBLIC_DOCSEARCH_API_KEY) &&
  Boolean(process.env.PUBLIC_DOCSEARCH_INDEX_NAME);

const packageAliases = Object.fromEntries(
  ['core', 'react', 'vue', 'svelte', 'cursors', 'relay', 'devtools'].map((name) => [
    `@roomful/${name}`,
    fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url)),
  ]),
);

export default defineConfig({
  site: 'https://docs.roomful.dev',
  integrations: [
    react(),
    starlight({
      title: 'Roomful',
      description: 'Real-time collaboration primitives for the web.',
      logo: {
        light: './src/assets/roomful-mark.svg',
        dark: './src/assets/roomful-mark.svg',
        replacesTitle: false,
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/erayates/roomful',
        },
      ],
      customCss: [
        '@fontsource-variable/geist',
        '@fontsource-variable/space-grotesk',
        './src/styles/site.css',
      ],
      routeMiddleware: './src/routeData.ts',
      expressiveCode: {
        themes: ['vitesse-dark'],
        styleOverrides: {
          borderRadius: '0.6rem',
        },
      },
      credits: false,
      disable404Route: true,
      pagefind: !hasDocSearch,
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Reference Guides',
          autogenerate: { directory: 'reference' },
        },
        {
          label: 'API Reference',
          autogenerate: { directory: 'api' },
        },
        {
          label: 'Recipes',
          autogenerate: { directory: 'recipes' },
        },
        {
          label: 'Project',
          autogenerate: { directory: 'project' },
        },
        {
          label: 'Playground',
          link: '/playground/',
        },
        {
          label: 'Community',
          items: [
            { label: 'Overview', link: '/community/' },
            {
              label: 'Discussions',
              link: 'https://github.com/erayates/roomful/discussions',
            },
            {
              label: 'Issues',
              link: 'https://github.com/erayates/roomful/issues',
            },
          ],
        },
      ],
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        Hero: './src/components/Hero.astro',
        Footer: './src/components/Footer.astro',
        MobileMenuFooter: './src/components/MobileMenuFooter.astro',
        Search: hasDocSearch
          ? './src/components/SearchDocSearch.astro'
          : './src/components/SearchPagefind.astro',
        ThemeSelect: './src/components/ThemeControls.astro',
      },
      plugins: hasDocSearch
        ? [
            starlightDocSearch({
              appId: process.env.PUBLIC_DOCSEARCH_APP_ID,
              apiKey: process.env.PUBLIC_DOCSEARCH_API_KEY,
              indexName: process.env.PUBLIC_DOCSEARCH_INDEX_NAME,
            }),
          ]
        : [],
    }),
  ],
  vite: {
    resolve: {
      alias: packageAliases,
    },
  },
});
