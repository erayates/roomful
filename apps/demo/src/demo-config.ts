import { readDemoRoomOverrides } from './demo-room';
import type { DemoRuntimeConfig } from './demo-types';

const DEFAULT_CANONICAL_BASE_URL = 'https://demo.roomful.dev';
const DEFAULT_PUBLIC_RELAY_URL = 'wss://relay.roomful.dev';
const DEFAULT_LOCAL_RELAY_URL = 'ws://127.0.0.1:8787';

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

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  );
}

export function resolveDemoRuntimeConfig(locationLike: LocationLike): DemoRuntimeConfig {
  const searchParams = new URLSearchParams(locationLike.search);
  const roomOverrides = readDemoRoomOverrides(searchParams);
  const relayUrl =
    normalizeRelayUrl(searchParams.get('relay') ?? undefined) ??
    normalizeRelayUrl(import.meta.env.VITE_ROOMFUL_RELAY_URL) ??
    (isLocalHostname(locationLike.hostname) ? DEFAULT_LOCAL_RELAY_URL : DEFAULT_PUBLIC_RELAY_URL);
  const canonicalBaseUrl =
    normalizeBaseUrl(import.meta.env.VITE_DEMO_BASE_URL) ?? DEFAULT_CANONICAL_BASE_URL;

  return {
    canonicalBaseUrl,
    dayOverride: roomOverrides.dayOverride,
    relayUrl,
    roomOverride: roomOverrides.roomOverride,
  };
}
