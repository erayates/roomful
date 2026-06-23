import { create } from 'storybook/theming';

/* Roomful brand theme for the cursors Storybook — matches the docs/landing palette. */
export const roomfulTheme = create({
  base: 'dark',
  brandTitle: 'Roomful UI',
  brandUrl: 'https://roomful.dev',
  brandTarget: '_blank',
  brandImage: './roomful-mark.svg',

  colorPrimary: '#5cc7ab',
  colorSecondary: '#5cc7ab',

  appBg: '#0e1413',
  appContentBg: '#0e1413',
  appPreviewBg: '#0e1413',
  appBorderColor: 'rgba(92, 199, 171, 0.18)',
  appBorderRadius: 8,

  textColor: '#e6ede9',
  textInverseColor: '#0b110f',
  textMutedColor: '#b6c4bf',

  barTextColor: '#b6c4bf',
  barSelectedColor: '#5cc7ab',
  barHoverColor: '#a3ecd9',
  barBg: '#141a18',

  inputBg: '#141a18',
  inputBorder: 'rgba(92, 199, 171, 0.18)',
  inputTextColor: '#e6ede9',
  inputBorderRadius: 6,

  fontBase: '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif',
  fontCode: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
});
