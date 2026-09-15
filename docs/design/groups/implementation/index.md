---
title: Implementation plans
order: 20
---

# Implementation plans

Each page here is the ordered work for one part of the groups system. It says what gets built,
in what order, and what each phase found. The design itself is in [Design](../design.md) and
[Decisions](../decisions.md).

- [Dataset creation plan](./dataset-creation-plan.md) — the ordered work for group import and upload
- [Access type order plan](./access-type-order-plan.md) — the ordered work to make the rest of the system agree with the access-type partial order
- [Access and requests plan](./access-requests-plan.md) — the ordered work for requesting and reviewing access
- [Profiles](./profiles.md) — the public face of a group or collection, and unauthenticated access
- [Group invitations](./invitations.md) — built, except the signup mismatch dialog
- [Dashboard plan](./dashboard-plan.md) — the ordered work for the landing page at `/v2/home`
- [End-to-end test plan](./e2e-test-plan.md) — the ordered work to build the suite [End-to-end test flows](../e2e-test-flows.md) describes
- [Access model verification plan](./access-model-verification-plan.md) — the ordered work to state the access model formally and test every consumer against it
- [Restrictions and resource state plan](./restrictions-plan.md) — the ordered work to separate resource state from authorization
