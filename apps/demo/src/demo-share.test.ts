import { createShareLinks } from './demo-share';

describe('demo-share', () => {
  it('builds an X share link', () => {
    const links = createShareLinks('https://demo.flockjs.dev');

    expect(links.x).toContain('twitter.com/intent/tweet');
    expect(links.x).toContain(encodeURIComponent('https://demo.flockjs.dev/'));
  });

  it('builds a LinkedIn share link', () => {
    expect(createShareLinks('https://demo.flockjs.dev').linkedin).toBe(
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fdemo.flockjs.dev%2F',
    );
  });
});
