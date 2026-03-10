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
