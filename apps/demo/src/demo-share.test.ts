import { createInviteUrl, createShareLinks } from './demo-share';

describe('demo-share', () => {
  it('builds an invite url with app, room, and relay params', () => {
    const invite = createInviteUrl(
      'https://demo.roomful.dev/',
      'canvas',
      'demo-abc123def456',
      'wss://relay.roomful.dev',
    );

    expect(invite).toContain('app=canvas');
    expect(invite).toContain('room=demo-abc123def456');
    expect(invite).toContain('relay=');
  });

  it('omits the relay param when no relay url is provided', () => {
    const invite = createInviteUrl('https://demo.roomful.dev/', 'canvas', 'demo-abc123def456');

    expect(invite).toContain('app=canvas');
    expect(invite).toContain('room=demo-abc123def456');
    expect(invite).not.toContain('relay=');
  });

  it('builds an X share link', () => {
    const links = createShareLinks('https://demo.roomful.dev');

    expect(links.x).toContain('twitter.com/intent/tweet');
    expect(links.x).toContain(encodeURIComponent('https://demo.roomful.dev/'));
  });

  it('builds a LinkedIn share link', () => {
    expect(createShareLinks('https://demo.roomful.dev').linkedin).toBe(
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fdemo.roomful.dev%2F',
    );
  });
});
