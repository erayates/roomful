# @cahoots/cursors

Prebuilt collaboration UI components for Cahoots.

## Install

```bash
npm install @cahoots/cursors
```

## Storybook

- Public Storybook: <https://erayates.github.io/cahoots/storybook/>
- Full component reference: <https://github.com/erayates/cahoots/blob/main/docs/reference/ui-components.md>

## Components

| Component            | Purpose                                    | Key props                                          |
| -------------------- | ------------------------------------------ | -------------------------------------------------- |
| `PeerCursor`         | Remote cursor marker with label            | `x`, `y`, `color`, `style`, `idle`, `name`         |
| `PresenceBar`        | Peer chips with avatars and overflow       | `size`, `showNames`, `maxVisible`, `onUserClick`   |
| `PresenceAvatars`    | Compact overlapping avatar stack           | `size`, `maxVisible`, `onUserClick`                |
| `TypingIndicator`    | Inline typing summary with animated dots   | `peers`, `ariaLabel`                               |
| `LiveIndicator`      | Pulsing live-activity marker               | `color`, `size`, `ariaLabel`                       |
| `CollaborationBadge` | Absolute-position badge for active editors | `peer`, `position`                                 |
| `SelectionHighlight` | Remote text selection overlay              | `peer`, `selection`                                |
| `FloatingReaction`   | Ephemeral emoji burst animation            | `emoji`, `x`, `y`, `size`, `durationMs`, `delayMs` |

## Usage

```ts
import { PeerCursor, PresenceBar, TypingIndicator } from '@cahoots/cursors';
```

Use Storybook for interactive prop exploration and visual regression checks. Use the reference doc for detailed behavior notes and integration examples with `@cahoots/react`.
