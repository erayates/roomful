import type { Peer, PresenceData } from '@roomful/core';
import { useEffect, useRef, useState } from 'react';

import type { AnimatedPresencePeer } from './presence-types';
import { PRESENCE_ANIMATION_DURATION_MS, PRESENCE_ENTER_DELAY_MS } from './presence-utils';

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export function useAnimatedPresencePeers<TPresence extends PresenceData>(
  peers: readonly Peer<TPresence>[],
): AnimatedPresencePeer<TPresence>[] {
  const [items, setItems] = useState<AnimatedPresencePeer<TPresence>[]>(() => {
    return peers.map((peer, index) => {
      return {
        order: index,
        peer,
        phase: 'entered',
      };
    });
  });
  const exitTimersRef = useRef<Map<string, TimerHandle>>(new Map());

  useEffect(() => {
    setItems((currentItems) => {
      const nextItems = mergeAnimatedPeers(currentItems, peers);
      return areAnimatedPeerArraysEqual(currentItems, nextItems) ? currentItems : nextItems;
    });
  }, [peers]);

  useEffect(() => {
    const hasEnteringPeers = items.some((item) => {
      return item.phase === 'entering';
    });
    if (!hasEnteringPeers) {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setItems((currentItems) => {
        return currentItems.map((item) => {
          if (item.phase !== 'entering') {
            return item;
          }

          return {
            ...item,
            phase: 'entered',
          };
        });
      });
    }, PRESENCE_ENTER_DELAY_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [items]);

  useEffect(() => {
    const exitingPeerIds = new Set(
      items
        .filter((item) => {
          return item.phase === 'exiting';
        })
        .map((item) => {
          return item.peer.id;
        }),
    );

    for (const item of items) {
      if (item.phase !== 'exiting' || exitTimersRef.current.has(item.peer.id)) {
        continue;
      }

      const timeoutId = globalThis.setTimeout(() => {
        exitTimersRef.current.delete(item.peer.id);
        setItems((currentItems) => {
          return currentItems.filter((currentItem) => {
            return currentItem.peer.id !== item.peer.id;
          });
        });
      }, PRESENCE_ANIMATION_DURATION_MS);

      exitTimersRef.current.set(item.peer.id, timeoutId);
    }

    for (const [peerId, timerHandle] of exitTimersRef.current.entries()) {
      if (exitingPeerIds.has(peerId)) {
        continue;
      }

      globalThis.clearTimeout(timerHandle);
      exitTimersRef.current.delete(peerId);
    }
  }, [items]);

  useEffect(() => {
    return () => {
      for (const timerHandle of exitTimersRef.current.values()) {
        globalThis.clearTimeout(timerHandle);
      }

      exitTimersRef.current.clear();
    };
  }, []);

  return items;
}

function mergeAnimatedPeers<TPresence extends PresenceData>(
  currentItems: readonly AnimatedPresencePeer<TPresence>[],
  nextPeers: readonly Peer<TPresence>[],
): AnimatedPresencePeer<TPresence>[] {
  const currentById = new Map(
    currentItems.map((item) => {
      return [item.peer.id, item] as const;
    }),
  );
  const nextPeerIds = new Set(
    nextPeers.map((peer) => {
      return peer.id;
    }),
  );

  const nextItems: AnimatedPresencePeer<TPresence>[] = nextPeers.map((peer, index) => {
    const existing = currentById.get(peer.id);
    if (!existing) {
      return {
        order: index,
        peer,
        phase: 'entering',
      };
    }

    return {
      order: index,
      peer,
      phase: existing.phase === 'exiting' ? 'entered' : existing.phase,
    };
  });

  for (const currentItem of currentItems) {
    if (nextPeerIds.has(currentItem.peer.id)) {
      continue;
    }

    nextItems.push({
      order: currentItem.order,
      peer: currentItem.peer,
      phase: 'exiting',
    });
  }

  return nextItems.sort(compareAnimatedPeers);
}

function compareAnimatedPeers<TPresence extends PresenceData>(
  a: AnimatedPresencePeer<TPresence>,
  b: AnimatedPresencePeer<TPresence>,
): number {
  if (a.order !== b.order) {
    return a.order - b.order;
  }

  if (a.phase === b.phase) {
    return 0;
  }

  if (a.phase === 'exiting') {
    return 1;
  }

  if (b.phase === 'exiting') {
    return -1;
  }

  return 0;
}

function areAnimatedPeerArraysEqual<TPresence extends PresenceData>(
  currentItems: readonly AnimatedPresencePeer<TPresence>[],
  nextItems: readonly AnimatedPresencePeer<TPresence>[],
): boolean {
  if (currentItems === nextItems) {
    return true;
  }

  if (currentItems.length !== nextItems.length) {
    return false;
  }

  for (let index = 0; index < currentItems.length; index += 1) {
    const currentItem = currentItems[index];
    const nextItem = nextItems[index];

    if (
      !currentItem ||
      !nextItem ||
      currentItem.order !== nextItem.order ||
      currentItem.phase !== nextItem.phase ||
      currentItem.peer !== nextItem.peer
    ) {
      return false;
    }
  }

  return true;
}
