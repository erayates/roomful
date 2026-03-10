export function appendRelayAuthTokenToUrl(
  relayUrl: string,
  relayAuthToken: string | undefined,
): string {
  if (relayAuthToken === undefined) {
    return relayUrl;
  }

  const url = new URL(relayUrl);
  url.searchParams.set('token', relayAuthToken);
  return url.toString();
}

export function resolveRelayHttpUrl(relayUrl: string, path: string): string {
  const url = new URL(relayUrl);
  const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const nextPath = path.startsWith('/') ? path : `/${path}`;
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = basePath === '' || basePath === '/' ? nextPath : `${basePath}${nextPath}`;
  return url.toString();
}
