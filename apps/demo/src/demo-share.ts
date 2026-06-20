export interface DemoShareLinks {
  linkedin: string;
  x: string;
}

export function createShareLinks(baseUrl: string): DemoShareLinks {
  const canonicalUrl = new URL('/', baseUrl).toString();
  const xUrl = new URL('https://twitter.com/intent/tweet');
  xUrl.searchParams.set('text', 'Draw together live on the Cahoots demo canvas.');
  xUrl.searchParams.set('url', canonicalUrl);

  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonicalUrl)}`,
    x: xUrl.toString(),
  };
}
