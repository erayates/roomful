FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /workspace

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/relay/package.json packages/relay/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/relay/README.md packages/relay/README.md
COPY packages/relay/tsconfig.json packages/relay/tsconfig.json
COPY packages/relay/src packages/relay/src

RUN pnpm --filter @cahoots/relay build
RUN pnpm --filter @cahoots/relay deploy --prod --legacy /app

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

RUN addgroup -S cahoots && adduser -S cahoots -G cahoots

COPY --from=build --chown=cahoots:cahoots /app/ ./

USER cahoots

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

ENTRYPOINT ["node", "dist/cli.js"]
