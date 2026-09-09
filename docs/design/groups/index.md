---
title: Groups
order: 1
---

# Groups, Collections, and Access Control

Four records, each answering one question. Start with whichever question you have.

| Question | Page |
|---|---|
| How does it work? | [Design](./design.md) |
| Why is it shaped that way, and what was rejected? | [Decisions](./decisions.md) |
| What do users need, and what is still missing? | [Use Cases](./use-cases.md) |
| Where is the code? | [Code Map](./code-map.md) |

Each fact lives on exactly one of those pages. Design says what the system does without
re-arguing why; Decisions carries the reasoning and the alternatives; Use Cases carries the
needs and the gap between them and the code; Code Map carries only the mapping from concept
to file. When two pages disagree, Decisions is the record of intent.

## Supporting records

- [Dataset creation](./dataset-creation.md) — the routes a dataset arrives by
- [Dataset creation plan](./dataset-creation-plan.md) — the ordered work for group import and upload
- [Dataset storage](./dataset-storage.md) — archival, staging, and download paths
- [v2 cut-over](../v2-cutover.md) — how v2 is built alongside v1, and how the legacy half retires
- [Access presets](./access-presets.md) — the preset layer over atomic grants
- [Profiles](./profiles.md) — the public face of a group or collection, and unauthenticated access
- [Access and requests plan](./access-requests-plan.md) — the ordered work for requesting and reviewing access
- [Access type order plan](./access-type-order-plan.md) — the ordered work to make the rest of the system agree with the access-type partial order
- [Dashboard plan](./dashboard-plan.md) — the ordered work for the landing page at `/v2/home`
- [Group invitations](./invitations.md) — built, except the signup mismatch dialog
- [UI information architecture](./ui-information-architecture.md) — how the pages are organised
- [Trust and communication](./trust-and-communication.md) — where the model is right and the surface misleads
- [End-to-end test flows](./e2e-test-flows.md) — what a browser-driven suite must prove, written from the design alone
- [End-to-end test plan](./e2e-test-plan.md) — the ordered work to build that suite
- [Domain glossary](./glossary.md) — the vocabulary

## History

Two records were folded into the four above once the work they tracked was done: an MVP
implementation plan whose eleven phases all shipped, and a design review of 2026-09-03 whose
findings were each answered in [Decisions](./decisions.md). Both remain in git history.
