# Release Completion Audit

Audience: maintainers deciding whether Roomful is release-complete.

This audit maps the launch requirements from `Roomful-Issues-Sprints.pdf`, especially EP-09 #054 through #057, to current proof commands and release evidence.

## Completion State

Roomful is locally release-ready at the initial `v1.0.0` release, but not publicly release-complete.

All seven public packages (`@roomful/core`, `cursors`, `devtools`, `react`, `relay`, `svelte`, `vue`) are pinned to `1.0.0` with clean initial-release changelogs. Local source, package, relay, docs, demo, benchmark, and smoke-test evidence is green. The remaining incomplete items require authenticated external publishing or deployed public services.

## PDF Launch Requirements

| Requirement                                                                                                                            | Current evidence                                                                                       | State                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Docs site built with getting started, API reference, playground, community links, dark mode, search, versioned docs, and mobile layout | `pnpm test:docs`, `pnpm docs:snippets`, docs workflow and `apps/docs` sources                          | Locally ready; public URL still must load                        |
| Demo app with shared canvas, live cursors, presence, mobile touch, cleanup, and social sharing                                         | `pnpm test:integration:demo`, demo workflow and `apps/demo` tests                                      | Locally ready; public URL still must load                        |
| End-to-end tests cover presence, cursors, state, awareness, events, reconnection, and real browsers                                    | `pnpm test:integration`, `pnpm test:integration:react`, `pnpm test:integration:demo`, `pnpm test:docs` | Locally verified                                                 |
| Packages published to npm under `@roomful`                                                                                             | `pnpm release:verify-public -- --tag v<release>`                                                       | Not complete until npm registry checks pass                      |
| GitHub Release tagged with changelog                                                                                                   | `pnpm release:verify-public -- --tag v<release>`                                                       | Not complete until GitHub Release API check passes               |
| Relay Docker image published                                                                                                           | `pnpm release:verify-public -- --tag v<release>`                                                       | Not complete until Docker Hub tag check passes                   |
| Show HN, blog, social, and Discord launch tasks complete                                                                               | [Launch kit](launch-kit.md)                                                                            | Prepared, not posted                                             |
| npm weekly downloads baseline recorded                                                                                                 | `pnpm release:downloads-baseline`                                                                      | Command available; final baseline must be recorded after publish |

## Local Release Proof Commands

Run these before tagging:

```bash
pnpm format:check
pnpm lint
pnpm verify:tsconfig-extends
pnpm typecheck:all
pnpm test
pnpm docs:snippets
pnpm build
pnpm test:types
pnpm verify:package-types
pnpm smoke:publish
pnpm test:integration
pnpm test:integration:react
pnpm test:integration:demo
pnpm test:docs
```

Relay release proof:

```bash
pnpm --filter @roomful/relay build
pnpm --filter @roomful/relay test
node packages/relay/dist/cli.js --version
docker build -t roomful-relay:test .
```

## Public Release Proof Commands

Run these after the release workflow succeeds:

```bash
pnpm release:verify-public -- --tag v<release>
pnpm release:downloads-baseline
```

`release:verify-public` checks:

- npm registry entries for every public `@roomful/*` package at the current package versions
- GitHub Release for the release tag
- Docker Hub tag for `roomful/relay`
- `https://docs.roomful.dev`
- `https://demo.roomful.dev`

## Current External Blockers

The current machine is missing required release credentials:

- `npm whoami` returns `ENEEDAUTH`
- `gh` is not installed on `PATH`
- Docker Desktop is available, but Docker Hub publish credentials are not confirmed for command-line release execution

The latest public verifier run for `v1.0.0` fails on all public release surfaces:

- npm `@roomful/*` registry checks return `404` (all seven packages at `1.0.0`)
- GitHub Release `v1.0.0` returns `404`
- Docker Hub `roomful/relay:1.0.0` returns `404`
- docs and demo public URLs do not load from this environment

## Final Release Sequence

1. Review the dirty worktree and stage only release-intended changes.
2. Commit the release-ready worktree.
3. Push the release commit to `main` through the normal review path.
4. Configure GitHub repository secrets: `NPM_TOKEN`, `DOCKERHUB_USERNAME`, and `DOCKERHUB_TOKEN`.
5. Push the intended `v*` tag from the release commit.
6. Wait for `.github/workflows/release.yml` to publish npm packages, Docker image, and GitHub Release.
7. Deploy or verify docs, demo, and Storybook public surfaces.
8. Run `pnpm release:verify-public -- --tag v<release>`.
9. Run `pnpm release:downloads-baseline`.
10. Publish launch announcements using [Launch Kit](launch-kit.md).

The project should only be marked release-complete after every public verifier check passes and launch links are recorded.
