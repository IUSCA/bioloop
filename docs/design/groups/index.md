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
- [Dataset storage](./dataset-storage.md) — archival, staging, and download paths
- [v2 cut-over](../v2-cutover.md) — how v2 is built alongside v1, and how the legacy half retires
- [UI information architecture](./ui-information-architecture.md) — how the pages are organised
- [Trust and communication](./trust-and-communication.md) — where the model is right and the surface misleads
- [End-to-end test flows](./e2e-test-flows.md) — what a browser-driven suite must prove, written from the design alone
- [Domain glossary](./glossary.md) — the vocabulary

[Implementation plans](./implementation/) holds the ordered work for each part of the system,
including profiles and group invitations.

## History

Two records were folded into the four above once the work they tracked was done: an MVP
implementation plan whose eleven phases all shipped, and a design review of 2026-09-03 whose
findings were each answered in [Decisions](./decisions.md). Both remain in git history.
