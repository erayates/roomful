import { createShareLinks } from './demo-share';

describe('demo-share', () => {
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
