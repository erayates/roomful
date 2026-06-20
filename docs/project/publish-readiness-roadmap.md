# Publish Readiness Roadmap

Audience: maintainers preparing Cahoots for npm distribution.

## Goal

Prove that every public package can be packed, installed into a real consumer project, built, and minimally exercised without relying on workspace linking.

## Current Baseline

The repository already has strong source-level validation:

- lint, typecheck, unit tests, and package builds
- browser integration tests for core, React, demo, and docs
- type declaration verification
- relay-specific distribution smoke coverage

The remaining publish-readiness gaps are different from source correctness:

- package tarballs must only contain publishable files
- consumer apps must install packed tarballs instead of workspace symlinks
- peer dependency requirements must be validated from a clean consumer install
- framework adapters must prove they bundle correctly outside the monorepo

## Exit Criteria

Release readiness is complete only when all of the following are true:

- every public package passes `pnpm pack` artifact validation
- every public package exposes the expected `dist` entrypoints inside the tarball
- no tarball contains source, test, coverage, or turbo artifacts
- smoke consumers install packed tarballs successfully
- smoke consumers pass their validate command from a clean install
- CI runs the publish smoke workflow on every pull request
- release workflow runs the publish smoke workflow before `pnpm release`

## Roadmap

### Phase 1: Artifact Hygiene

- add `files` allowlists to all publishable packages
- verify `main`, `types`, and `exports` targets exist inside packed tarballs
- fail validation when tarballs contain `src`, `coverage`, `integration`, `test-d`, or `.turbo`

### Phase 2: Consumer Smoke Apps

- add standalone smoke consumers under `smoke/templates`
- pack public packages with `pnpm pack`
- install tarballs into generated `.smoke/workdirs/*` projects with `npm install`
- validate these consumer targets:
  - `core-vanilla`
  - `react-app`
  - `vue-app`
  - `svelte-app`
  - `cursors-react`
  - `devtools-import`

### Phase 3: Feature Coverage Signoff

- track which product claims are covered by source tests
- track which claims are covered by packed-consumer smoke tests
- identify any features that still require manual release verification

### Phase 4: CI and Release Gates

- run publish smoke in CI on Node 20
- run publish smoke in the release workflow before publishing packages
- keep relay-specific distribution checks as a separate job

## Commands

Build and validate artifacts locally:

```bash
pnpm build
pnpm verify:package-types
pnpm smoke:publish
```

Run a subset of smoke consumers during local debugging:

```bash
pnpm smoke:publish -- core-vanilla react-app
```

## Release Checklist

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck:all`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm test:types`
- [ ] `pnpm verify:package-types`
- [ ] `pnpm smoke:publish`
- [ ] `pnpm test:integration`
- [ ] `pnpm test:integration:react`
- [ ] `pnpm test:integration:demo`
- [ ] `pnpm test:docs`
- [ ] confirm relay tarball, CLI, and Docker smoke checks are passing in CI
- [ ] confirm peer dependency install guidance is current for CRDT and framework adapters
- [ ] confirm GitHub Release notes are generated after npm and Docker publishing succeed
- [ ] verify public npm, GitHub Release, Docker, docs, and demo surfaces with `pnpm release:verify-public -- --tag v<release>`
- [ ] record npm download baseline with `pnpm release:downloads-baseline`

## Package Smoke Matrix

| Package             | Consumer target   | Primary proof                                   |
| ------------------- | ----------------- | ----------------------------------------------- |
| `@cahoots/core`     | `core-vanilla`    | Vite build + typecheck against packed tarball   |
| `@cahoots/react`    | `react-app`       | React consumer build against packed tarballs    |
| `@cahoots/vue`      | `vue-app`         | Vue consumer build against packed tarballs      |
| `@cahoots/svelte`   | `svelte-app`      | Svelte consumer build against packed tarballs   |
| `@cahoots/cursors`  | `cursors-react`   | React UI consumer build against packed tarballs |
| `@cahoots/devtools` | `devtools-import` | Typecheck + runtime import smoke                |
| `@cahoots/relay`    | CI relay job      | Tarball install, CLI health check, Docker smoke |

## Manual Signoff Items

These are still worth checking on release candidates even after automation passes:

- install each framework adapter into a fresh external app when changing exports or peers
- verify changelog and install docs match the actual dependency model
- verify release tags and npm dist-tags target the intended version
- verify the GitHub Release exists for the release tag
- verify relay image and CLI version output match the package version
- verify docs and demo public URLs load after deployment
- record launch links and npm download baseline using [Launch Kit](launch-kit.md)

## Related Docs

- [Development setup](development-setup.md)
- [Release completion audit](release-completion-audit.md)
- [Release process](release-process.md)
- [Repository structure](repository-structure.md)
