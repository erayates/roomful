/**
 * Runtime configuration for the interop example, resolved from the URL and Vite env.
 */
export interface InteropConfig {
  /**
   * The relay URL to connect to. Cross-platform interop needs one; `undefined` shows a prompt.
   */
  relayUrl: string | undefined;

  /**
   * The room every client must share to collaborate.
   */
  roomId: string;

  /**
   * The local peer's display name.
   */
  name: string;

  /**
   * The local peer's colour.
   */
  color: string;
}

const PALETTE = ['#5cc7ab', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#34d399'];

/**
 * Resolves configuration: `?relay=` then `VITE_ROOMFUL_RELAY_URL` for the relay, `?room=` for the
 * room, and `?name=` / `?color=` (otherwise a random identity) for this peer.
 */
export function resolveInteropConfig(location: Location): InteropConfig {
  const params = new URLSearchParams(location.search);
  const relayUrl = params.get('relay') ?? import.meta.env.VITE_ROOMFUL_RELAY_URL ?? undefined;
  const roomId = params.get('room') ?? 'roomful-interop-demo';
  const shortId = crypto.randomUUID().slice(0, 4);
  const fallbackColor = PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? '#5cc7ab';

  return {
    relayUrl,
    roomId,
    name: params.get('name') ?? `Web ${shortId}`,
    color: params.get('color') ?? fallbackColor,
  };
}
