import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement } from 'react';

import { FloatingReaction, type FloatingReactionProps } from '../src';
import { FloatingReactionHarness } from './floating-reaction-harness';
import { StorySurface } from './story-layout';

const meta = {
  title: '@flockjs/cursors/FloatingReaction',
  component: FloatingReaction,
  tags: ['autodocs'],
  args: {
    delayMs: 0,
    durationMs: 1_500,
    emoji: String.fromCodePoint(0x2728),
    size: 36,
    x: 0.5,
    y: 0.68,
  },
  argTypes: {
    delayMs: {
      control: { type: 'range', min: 0, max: 1_000, step: 50 },
    },
    durationMs: {
      control: { type: 'range', min: 300, max: 3_000, step: 100 },
    },
    emoji: {
      control: 'text',
    },
    size: {
      control: { type: 'range', min: 12, max: 72, step: 1 },
    },
    x: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
    y: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
    },
  },
  render: (args) => {
    return createElement(FloatingReactionHarness, args);
  },
} satisfies Meta<FloatingReactionProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const StaggeredBurst: Story = {
  render: () => {
    return createElement(
      StorySurface,
      {
        background: 'linear-gradient(135deg, #fff7ed 0%, #fde68a 100%)',
        height: 260,
        width: 420,
      },
      createElement(FloatingReaction, {
        delayMs: 0,
        durationMs: 1_400,
        emoji: String.fromCodePoint(0x2728),
        size: 34,
        x: 0.42,
        y: 0.7,
      }),
      createElement(FloatingReaction, {
        delayMs: 180,
        durationMs: 1_600,
        emoji: String.fromCodePoint(0x1f389),
        size: 30,
        x: 0.52,
        y: 0.64,
      }),
      createElement(FloatingReaction, {
        delayMs: 320,
        durationMs: 1_800,
        emoji: String.fromCodePoint(0x1f525),
        size: 28,
        x: 0.58,
        y: 0.72,
      }),
    );
  },
};
