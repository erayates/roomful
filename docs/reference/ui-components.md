# UI Components (`@flockjs/cursors`)

Audience: users.

Storybook: <https://erayates.github.io/flockjs/storybook/>

## Component Catalog

| Component            | Purpose                            |
| -------------------- | ---------------------------------- |
| `PeerCursor`         | animated cursor with label         |
| `PresenceBar`        | online user list                   |
| `PresenceAvatars`    | compact avatar stack               |
| `LiveIndicator`      | area-level activity marker         |
| `TypingIndicator`    | typing state visualization         |
| `CollaborationBadge` | peer activity indicator on element |
| `SelectionHighlight` | peer selection overlay             |
| `FloatingReaction`   | transient reaction animation       |

## Example: `PresenceBar`

```tsx
import { PresenceBar } from '@flockjs/cursors';
import { FlockProvider } from '@flockjs/react';

export function HeaderPresence() {
  return (
    <FlockProvider
      roomId="presence-demo"
      presence={{ avatar: '/avatars/ada.png', color: '#4F46E5', name: 'Ada Lovelace' }}
      transport="broadcast"
    >
      <PresenceBar
        maxVisible={5}
        showNames
        size="md"
        onUserClick={(user) => console.log(user.id)}
      />
    </FlockProvider>
  );
}
```

### `PresenceBar` Props

| Prop          | Type                   | Notes                                                             |
| ------------- | ---------------------- | ----------------------------------------------------------------- |
| `maxVisible`  | `number`               | visible peer chips before rendering a separate `+N` overflow chip |
| `showNames`   | `boolean`              | shows or hides inline peer names; defaults to `true`              |
| `size`        | `'sm' \| 'md' \| 'lg'` | controls avatar, chip, and text sizing                            |
| `onUserClick` | `(peer: Peer) => void` | makes peer chips interactive and receives the clicked peer        |

`PresenceBar` reads peers from `usePresence().all`, includes the local user, and uses native `title` tooltips for full names. Avatars come from `peer.avatar`; when absent, the chip shows colored initials using `peer.color` or a deterministic fallback color derived from `peer.id`.

## Example: `PresenceAvatars`

```tsx
import { PresenceAvatars } from '@flockjs/cursors';
import { FlockProvider } from '@flockjs/react';

export function CompactPresence() {
  return (
    <FlockProvider roomId="presence-demo" presence={{ color: '#0F766E', name: 'Grace Hopper' }}>
      <PresenceAvatars maxVisible={3} onUserClick={(user) => console.log(user.name)} />
    </FlockProvider>
  );
}
```

### `PresenceAvatars` Props

| Prop          | Type                   | Notes                                                          |
| ------------- | ---------------------- | -------------------------------------------------------------- |
| `maxVisible`  | `number`               | visible avatar circles before rendering a stacked `+N` badge   |
| `size`        | `'sm' \| 'md' \| 'lg'` | controls avatar and overflow badge sizing                      |
| `onUserClick` | `(peer: Peer) => void` | makes avatar circles interactive and receives the clicked peer |

`PresenceAvatars` uses the same peer data and avatar fallback rules as `PresenceBar`, but renders an overlapping stack of avatar circles for dense header layouts.

## Example: `TypingIndicator`

```tsx
import { TypingIndicator } from '@flockjs/cursors';

export function ComposerFooter({ peers }) {
  return <TypingIndicator peers={peers} ariaLabel="Users currently typing" />;
}
```

### `TypingIndicator` Props

| Prop        | Type     | Notes                                                           |
| ----------- | -------- | --------------------------------------------------------------- |
| `peers`     | `Peer[]` | peers currently typing; renders nothing when the array is empty |
| `ariaLabel` | `string` | overrides the default accessible label text                     |

`TypingIndicator` renders inline text plus three animated CSS dots. It shows up to three peer names and collapses any remainder into `and N others`.

## Example: `LiveIndicator`

```tsx
import { LiveIndicator } from '@flockjs/cursors';

export function LivePresenceBadge() {
  return <LiveIndicator color="#f97316" size={12} ariaLabel="Live editing hotspot" />;
}
```

### `LiveIndicator` Props

| Prop        | Type     | Notes                                       |
| ----------- | -------- | ------------------------------------------- |
| `color`     | `string` | pulse and core color; defaults to green     |
| `size`      | `number` | rendered diameter in pixels                 |
| `ariaLabel` | `string` | overrides the default accessible label text |

`LiveIndicator` renders a compact pulsing dot for presence hotspots and uses inline styles plus embedded keyframes only.

## Example: `CollaborationBadge`

```tsx
import { CollaborationBadge } from '@flockjs/cursors';

export function FieldBadge({ peer }) {
  return (
    <div style={{ position: 'relative' }}>
      <textarea aria-label="Collaborative field" />
      <CollaborationBadge peer={peer} position={{ right: 8, top: 8 }} />
    </div>
  );
}
```

### `CollaborationBadge` Props

| Prop       | Type                                                                                                       | Notes                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `peer`     | `Peer`                                                                                                     | supplies the badge label and color fallback            |
| `position` | `{ top?: number \| string; right?: number \| string; bottom?: number \| string; left?: number \| string }` | absolute offsets inside a relatively positioned parent |

`CollaborationBadge` renders a decorative absolute-positioned badge for peers actively editing an element. It uses `peer.name` when available, falls back to `peer.id`, and derives the badge color from `peer.color` or the same deterministic fallback palette used by the presence components.

## Example: `PeerCursor`

```tsx
import { PeerCursor } from '@flockjs/cursors';

{
  cursors.map((cursor) => (
    <PeerCursor
      key={cursor.userId}
      x={cursor.x}
      y={cursor.y}
      name={cursor.name}
      color={cursor.color}
      idle={cursor.idle}
      style="arrow"
    />
  ));
}
```

### `PeerCursor` Props

| Prop    | Type                            | Notes                                          |
| ------- | ------------------------------- | ---------------------------------------------- |
| `x`     | `number`                        | normalized horizontal position from `0` to `1` |
| `y`     | `number`                        | normalized vertical position from `0` to `1`   |
| `name`  | `string`                        | peer label rendered next to the cursor         |
| `color` | `string`                        | marker color and label background color        |
| `idle`  | `boolean`                       | starts a 3 second label hide timer when `true` |
| `style` | `'arrow' \| 'dot' \| 'pointer'` | selects one of the built-in inline SVG markers |

`PeerCursor` uses inline styles only, sets `aria-hidden="true"`, and keeps movement interpolation inside the component with CSS transitions. When `idle` becomes `true`, the marker stays visible and the name label fades out after 3 seconds of inactivity.

## Example: `SelectionHighlight`

```tsx
import { SelectionHighlight } from '@flockjs/cursors';

export function RemoteSelection({ peer }) {
  return (
    <>
      <p id="editor-copy">Ada Lovelace writes tests.</p>
      <SelectionHighlight peer={peer} selection={{ elementId: 'editor-copy', from: 4, to: 12 }} />
    </>
  );
}
```

### `SelectionHighlight` Props

| Prop        | Type                                                      | Notes                                                             |
| ----------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `peer`      | `Peer`                                                    | supplies the highlight color fallback                             |
| `selection` | `{ elementId: string; from: number; to: number } \| null` | targets a text range inside the element identified by `elementId` |

`SelectionHighlight` prefers the CSS Custom Highlight API and falls back to span injection when highlights are unavailable. The component normalizes reversed ranges, clamps invalid offsets, and removes any injected styles or wrapper spans when the selection changes or the component unmounts.

## Example: `FloatingReaction`

```tsx
import { FloatingReaction } from '@flockjs/cursors';

export function ReactionBurst() {
  return (
    <div style={{ position: 'relative', width: '180px', height: '180px' }}>
      <FloatingReaction emoji="🔥" x={0.45} y={0.7} size={40} />
    </div>
  );
}
```

Provide `x` and `y` as normalized values (`0` to `1`) so you can anchor reactions to cursor data, and use `delayMs` to stagger multiple reactions at the same spot. The component floats upward, fades out over the default 1.5s, and removes itself once the animation completes.

## Usage Notes

- Use kit components for faster integration.
- Use custom renderers for product-specific interaction design.

## Related Docs

- [Package README](../../packages/cursors/README.md)
- [Reference index](README.md)
- [Cursor engine](engines-cursors.md)
- [React adapter](adapters-react.md)
- [Multiplayer canvas recipe](../recipes/multiplayer-canvas.md)
- [Docs index](../README.md)
