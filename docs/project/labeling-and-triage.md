# Labeling and Triage

Audience: contributors and maintainers.

## Label Taxonomy

The v2 → v3 program uses a grouped label system so issues can be filtered by type, platform, area,
status, priority, and risk. Each issue carries **one milestone**; epics may span several sprints via a
GitHub Project custom field. (This supersedes the flat v1 labels; the earlier area labels — `core`,
`react`, `vue`, `svelte`, `relay`, `ui`, `devtools`, `infra`, `testing` — map onto the `area:*` /
`platform:*` groups below.)

### Type

- `type:epic` — large product area
- `type:feature` — new capability
- `type:bug`
- `type:docs`
- `type:research` / `type:dx`
- `type:security`
- `type:demo` — demo or example project

### Platform

- `platform:web` (JS/TS SDKs)
- `platform:dart` (pure Dart core)
- `platform:flutter` (Flutter SDK/UI)
- `platform:react-native` (future)
- `platform:relay`
- `platform:cloud`

### Area

- `area:protocol`
- `area:presence` · `area:cursors` · `area:comments` · `area:locks`
- `area:ai-agents`
- `area:offline`
- `area:observability`
- `area:self-host`
- `area:privacy`

### Status

- `status:planned` · `status:in-progress` · `status:blocked`
- `status:needs-rfc` · `status:ready-for-review` · `status:released`

### Priority

- `priority:p0` (blocking/critical) · `priority:p1` · `priority:p2` · `priority:p3`

### Risk

- `risk:breaking-change` · `risk:security` · `risk:scope-creep` · `risk:performance` · `risk:uncertain`

## Milestones

One milestone per issue, matching the [v2 → v3 backlog](v2-v3-backlog.md):

`v2.0-beta`, `v2.1-alpha`, `v2.2-beta`, `v2.3`, `v2.4`, `v2.5`, `v2.6`, `v2.7`, `v2.8`, `v3.0-rc`, `v3.0`.

## Issue Flow

1. `Backlog`: issue created and labeled.
2. `Sprint Backlog`: accepted for sprint planning.
3. `In Progress`: work started.
4. `Done`: merged and verified.

## Triage Rules

- Bugs must include reproducible steps.
- Feature proposals should include API-level intent.
- Security-sensitive reports must use private channels.

## Related Docs

- [Contributing](../../CONTRIBUTING.md)
- [Support](../../SUPPORT.md)
- [Execution plan](execution-plan.md)
- [Docs index](../README.md)
