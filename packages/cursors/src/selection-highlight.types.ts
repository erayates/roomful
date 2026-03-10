import type { Peer, PresenceData } from '@flockjs/core';

export interface SelectionRange {
  elementId: string;
  from: number;
  to: number;
}

export interface SelectionHighlightProps<TPresence extends PresenceData = PresenceData> {
  peer: Peer<TPresence>;
  selection: SelectionRange | null;
}
