import { readDemoRoomOverrides } from './demo-room';
import type { DemoRuntimeConfig } from './demo-types';

const DEFAULT_CANONICAL_BASE_URL = 'https://demo.roomful.dev';

interface LocationLike {
  hostname: string;
  search: string;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    return new URL('/', url).toString();
  } catch {
    return undefined;
  }
}

function normalizeRelayUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return undefined;
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Resolves the demo's runtime config. The default transport is BroadcastChannel — it works
 * with zero backend (sync across tabs/windows in one browser). A WebSocket relay is opt-in:
 * provide it via `?relay=wss://…` or the `VITE_ROOMFUL_RELAY_URL` build env to unlock
 * cross-device multiplayer without any code change.
 */
export function resolveDemoRuntimeConfig(locationLike: LocationLike): DemoRuntimeConfig {
  const searchParams = new URLSearchParams(locationLike.search);
  const roomOverrides = readDemoRoomOverrides(searchParams);
  const relayUrl =
    normalizeRelayUrl(searchParams.get('relay') ?? undefined) ??
    normalizeRelayUrl(import.meta.env.VITE_ROOMFUL_RELAY_URL);
  const transport: 'broadcast' | 'websocket' = relayUrl ? 'websocket' : 'broadcast';
  const transportLabel = relayUrl
    ? 'Live relay · synced across devices'
    : 'In-browser · open a second tab to collaborate';
  const canonicalBaseUrl =
    normalizeBaseUrl(import.meta.env.VITE_DEMO_BASE_URL) ?? DEFAULT_CANONICAL_BASE_URL;

  return {
    canonicalBaseUrl,
    dayOverride: roomOverrides.dayOverride,
    relayUrl,
    roomOverride: roomOverrides.roomOverride,
    transport,
    transportLabel,
  };
}
