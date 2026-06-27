export interface DemoShareLinks {
  linkedin: string;
  x: string;
}

export function createInviteUrl(
  baseUrl: string,
  appId: string,
  roomId: string,
  relayUrl?: string,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('app', appId);
  url.searchParams.set('room', roomId);
  if (relayUrl) {
    url.searchParams.set('relay', relayUrl);
  }
  return url.toString();
}

export function createShareLinks(baseUrl: string): DemoShareLinks {
  const canonicalUrl = new URL('/', baseUrl).toString();
  const xUrl = new URL('https://twitter.com/intent/tweet');
  xUrl.searchParams.set('text', 'Draw together live on the Roomful demo canvas.');
  xUrl.searchParams.set('url', canonicalUrl);

  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonicalUrl)}`,
    x: xUrl.toString(),
  };
}
