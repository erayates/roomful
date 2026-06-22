import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

/* Site-wide public-beta banner. Styled via `.sl-banner` in src/styles/site.css. */
export const onRequest = defineRouteMiddleware((context) => {
  const { starlightRoute } = context.locals;
  starlightRoute.entry.data.banner = {
    content:
      'Roomful is in <strong>public beta</strong> — install with the <code>@beta</code> tag. <a href="https://github.com/erayates/roomful/issues">Share feedback →</a>',
  };
});
