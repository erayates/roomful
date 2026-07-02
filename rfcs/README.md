# Roomful RFCs

Design proposals for protocol-affecting or cross-cutting changes. An RFC is required (label
`status:needs-rfc`) before implementing anything that changes the wire protocol, breaks compatibility,
or spans multiple SDKs — see the [Roadmap](../ROADMAP.md) change-management note and the
[v2 → v3 backlog](../docs/project/v2-v3-backlog.md).

## Index

| RFC                         | Title                                                               | Status | Target    |
| --------------------------- | ------------------------------------------------------------------- | ------ | --------- |
| [0001](0001-protocol-v2.md) | Roomful Protocol v2 — versioned event envelope & cross-SDK contract | Draft  | v2.0-beta |

## Process

1. **Open** — copy the metadata table from RFC-0001, take the next number, open a PR adding
   `rfcs/NNNN-slug.md` with `Status: Draft`, and link the tracking issue.
2. **Discuss** — review happens on the PR. Substantive protocol changes need at least one maintainer
   sign-off and, where relevant, cross-SDK feasibility notes.
3. **Accept** — merge with `Status: Accepted` (or `Draft` if it is a living spec being iterated).
   Implementation issues reference the RFC number.
4. **Supersede** — a later RFC that replaces an earlier one sets `Supersedes:` and flips the old one
   to `Status: Superseded`.

RFCs are versioned with the repository; keep them accurate to shipped behavior (documenting reality is
allowed and encouraged — RFC-0001 is partly a spec of the already-implemented protocol).
