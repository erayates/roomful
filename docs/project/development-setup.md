# Development Setup

Audience: contributors.

## Prerequisites

- Node.js `20` locally (validated in CI)
- `pnpm`
- `git`
- Optional for Dart SDK work: Dart stable SDK (`dart`)
- Optional for Flutter SDK work: Flutter stable SDK (`flutter`)

## Clone and Install

```bash
git clone https://github.com/erayates/roomful.git
cd roomful
pnpm install
```

## Expected Workspace Commands

```bash
pnpm build
pnpm test
pnpm test:types
pnpm test:watch
pnpm lint
pnpm format:check
pnpm format:write
pnpm typecheck
pnpm typecheck:root
pnpm typecheck:all
pnpm verify:package-types
pnpm smoke:publish
pnpm changeset
pnpm version-packages
pnpm release:status
```

Additional integration workflow:

```bash
pnpm test:integration
```

Install the Playwright browsers before running the browser suite locally:

```bash
pnpm exec playwright install chromium firefox webkit
```

`pnpm test:integration` runs the real multi-tab browser transport suite for Chromium, Firefox,
and Playwright WebKit. WebKit is used as the Safari-equivalent coverage target in CI. The WebRTC
scenario is skipped automatically when the underlying WebKit runtime does not expose
`RTCPeerConnection`.

## Dart and Flutter SDK Checks

The Dart and Flutter packages are source-present alpha packages under `dart/`. They are validated by
separate GitHub Actions workflows:

- `.github/workflows/dart.yml` for `dart/roomful`
- `.github/workflows/flutter.yml` for `dart/roomful_flutter`

Run the Dart core checks locally with:

```bash
cd dart/roomful
dart pub get
dart analyze
dart test
```

Run the Flutter package checks locally with:

```bash
cd dart/roomful_flutter
flutter pub get
flutter analyze
flutter test
```

`roomful_flutter` currently depends on `roomful` by local path and has `publish_to: none`, so pub.dev
release readiness is a separate task from JS/npm release readiness.

Run the self-hostable `@roomful/relay` signaling server locally for WebRTC validation:

```bash
pnpm --filter @roomful/relay build
pnpm --filter @roomful/relay start
```

Optional relay env overrides:

```bash
HOST=0.0.0.0 PORT=8787 MAX_CONNECTIONS=1000 pnpm --filter @roomful/relay start
curl http://127.0.0.1:8787/health
```

Optional multi-instance relay mode:

```bash
ROOMFUL_REDIS_URL=redis://127.0.0.1:6379/0 pnpm --filter @roomful/relay start
```

## Working Norms

- Prefer small, focused PRs.
- Keep docs and tests in the same PR as behavior changes.
- Preserve strict TypeScript compatibility.
- Follow the canonical [code conventions](code-conventions.md) policy.
- Keep imports sorted and lint-clean before commit.
- Run Prettier checks before opening a PR.
- Keep package unit tests in `src/**/*.test.ts` for Vitest convention consistency.
- Keep declaration-only type tests in `test-d/**/*.test-d.ts`.
- Core package coverage threshold must stay at or above 80%.
- Add a changeset file for release-relevant changes in `packages/*`.

## CI and Release

- PR workflow: `.github/workflows/ci.yml`
- Release workflow: `.github/workflows/release.yml`
- PR validation matrix: Node `20`
- Validation order: install -> lint -> format -> typecheck -> test -> docs snippets -> build -> test:types -> verify:package-types -> publish smoke
- Release trigger: push tag matching `v*`
- Release output: npm packages, relay Docker image, and generated GitHub Release

Required GitHub secrets for release:

- `NPM_TOKEN` (required)
- `DOCKERHUB_USERNAME` (required)
- `DOCKERHUB_TOKEN` (required)
- `TURBO_TEAM` (optional, for remote cache)
- `TURBO_TOKEN` (optional, for remote cache)

## Local Hooks

Husky is configured to enforce quality checks during commits:

- `pre-commit`: `pnpm lint` + `pnpm typecheck`
- `commit-msg`: commitlint conventional-commit validation

Use `--no-verify` only for emergency situations.

## Troubleshooting

- If workspace linking fails, reinstall dependencies from repository root.
- If type errors look stale, clear local build artifacts and rerun typecheck.
- If `pnpm typecheck` passes but `pnpm typecheck:root` fails, verify root `tsconfig.json` includes only intended sources and excludes tests/build output.
- If coverage output is missing, confirm tests are under `packages/*/src/**/*.test.ts` and rerun `pnpm test`.
- If declaration-only tests fail, rebuild workspace packages before rerunning `pnpm test:types`.
- If packaged declaration verification fails, run `pnpm build` and then `pnpm verify:package-types` to inspect the reported package.
- If packed consumer smoke tests fail, run `pnpm build` and then `pnpm smoke:publish` to reproduce the install/build failure in `.smoke/workdirs`.
- If releases fail before publish, confirm `NPM_TOKEN`, `DOCKERHUB_USERNAME`, and `DOCKERHUB_TOKEN` are configured in repository secrets.
- If WebRTC peers do not connect, verify `relayUrl` points to a reachable `@roomful/relay` instance and check browser console ICE errors.
- Same-origin BroadcastChannel fallback only occurs during the initial WebRTC connect attempt when signaling is unavailable.

## Related Docs

- [Contributing](../../CONTRIBUTING.md)
- [Code conventions](code-conventions.md)
- [Repository structure](repository-structure.md)
- [WebRTC validation checklist](webrtc-validation.md)
- [Labeling and triage](labeling-and-triage.md)
- [Release process](release-process.md)
- [Publish readiness roadmap](publish-readiness-roadmap.md)
- [Docs index](../README.md)
