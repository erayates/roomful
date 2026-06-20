import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement } from 'react';

import { LiveIndicator, type LiveIndicatorProps } from '../src';
import { StoryGrid, StorySurface } from './story-layout';

const meta = {
  title: '@cahoots/cursors/LiveIndicator',
  component: LiveIndicator,
  tags: ['autodocs'],
  args: {
    ariaLabel: 'Live editing hotspot',
    color: '#22c55e',
    size: 12,
  },
  argTypes: {
    ariaLabel: {
      control: 'text',
    },
    color: {
      control: 'color',
    },
    size: {
      control: { type: 'range', min: 6, max: 28, step: 1 },
    },
  },
  render: (args) => {
    return createElement(
      StorySurface,
      {
        height: 180,
        width: 260,
      },
      createElement(LiveIndicator, args),
    );
  },
} satisfies Meta<LiveIndicatorProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SizeAndColorMatrix: Story = {
  render: () => {
    return createElement(
      StoryGrid,
      {
        columns: 3,
      },
      ...[
        { color: '#22c55e', size: 8 },
        { color: '#2563eb', size: 12 },
        { color: '#f97316', size: 18 },
        { color: '#e11d48', size: 10 },
        { color: '#7c3aed', size: 16 },
        { color: '#0f766e', size: 22 },
      ].map((item) => {
        return createElement(
          StorySurface,
          {
            height: 140,
            key: `${item.color}-${item.size}`,
            width: 180,
          },
          createElement(LiveIndicator, {
            ariaLabel: `Live indicator ${item.color}`,
            color: item.color,
            size: item.size,
          }),
        );
      }),
    );
  },
};
