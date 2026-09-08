---
title: UI Information Architecture
order: 6
status: active
implemented: partial
last_verified: 2026-09-03
---

::: warning Design record — active
The page structure the [groups design](./design.md) is meant to be operated through.
Some of this is built and some is not. For what the code does today, see
[Implementation Status](./implementation-status.md).
:::

# UI Information Architecture

This record fixes the top-level page structure, the tabs on each detail page, and the
rule for deciding which tabs a given caller sees. It exists so that every resource page
is laid out the same way and so that tab visibility follows from the authorization
model rather than from per-page judgement.

Visual mockups of these screens are vendored at
[`docs/public/mockups/`](https://github.com/IUSCA/bioloop/tree/main/docs/public/mockups) —
`ui-design.html` is the design spec, and the others show the portal, dashboards, grant
views, and creation flows. They are snapshots of intent, not of shipped UI.

## Top-level pages

Seven areas make up the portal.

- **Dashboard** — recent activity, stats, quick links.
- **Groups** — hierarchy, membership, archival.
- **Datasets** — ownership, grants, collection membership, lifecycle.
- **Collections** — dataset containers and grant targets.
- **Grants** — cross-resource grant browsing and issuance.
- **Access Requests** — the request, review, and decision workflow.
- **Audit Log** — the immutable event stream, platform admin only.

## Page map

```
├── / (dashboard: recent activity, stats, quick links)
├── /groups
│   ├── /groups  (browse & search, create group action)
│   └── /groups/:id
│       ├── tab: Overview (archive/unarchive, edit metadata actions)
│       ├── tab: Members (add, remove, change role actions)
│       ├── tab: Subgroups (create subgroup action)
│       ├── tab: Collections (create collection action)
│       ├── tab: Datasets (new dataset action)
│       ├── tab: Access (grants issued to this group)
│       └── tab: Audit Log (admin / oversight only)
│
├── /datasets (underlying data is immutable)
│   ├── /datasets  (browse & search)
│   └── /datasets/:id
│       ├── tab: Overview (archive/unarchive, edit metadata actions)
│       ├── tab: Files
│       ├── tab: Workflows (launch, stop/restart, delete actions)
│       ├── tab: Access (issue or revoke grants actions)
│       ├── tab: Collections (collections this dataset belongs to)
│       ├── tab: Access Requests (request access, or review incoming requests)
│       └── tab: Audit Log (admin / oversight only)
│
├── /collections
│   ├── /collections  (browse & search)
│   └── /collections/:id
│       ├── tab: Overview (archive/unarchive, edit metadata actions)
│       ├── tab: Datasets (add / remove datasets actions)
│       ├── tab: Access (issue or revoke grants actions)
│       ├── tab: Access Requests (request access, or review incoming requests)
│       └── tab: Audit Log (admin / oversight only)
│
├── /access-requests
│   ├── Inbox (requests pending my review, plus my own submitted requests)
│   └── Detail view per request (submit view, review view, resolved view)
│
├── /grants
│   ├── /grants  (browse & search)
│   └── Issue grant modal (used from several places)
│
└── /audit-log  (global event stream, platform admin only)
```

## Role-sensitive rendering

The portal renders actions per role rather than disabling them.

- **Platform admin** sees everything, with every action enabled.
- **Group admin** has full governance of their own groups, datasets, and collections,
  and read-only oversight of descendant groups.
- **Member** sees group metadata and membership, with no governance actions.
- **Grant holder** sees only what their grants allow, described below.

Forbidden actions are hidden, not greyed out, and the filtering happens at the query
layer. Oversight-only views carry a visible "read-only oversight" banner so that an
overseer is never led to believe they can act.

## UX principles

Four principles apply across every page.

1. **Every access decision is explainable.** "Why does X have access?" is answerable
   inline. The UI shows the minimal grant and membership chain that caused the access.
   See [Explainability and Effective Access](./design.md#explainability-and-effective-access).
2. **Archived resources are visually distinct** everywhere they appear.
3. **Grant atomicity is abstracted by presets.** Raw grants stay available behind an
   "Advanced" toggle. See [Access Presets](./access-presets.md).
4. **The audit trail is one click from every material action's success toast.**

Explainability is a system invariant, not a UI nicety. It is surfaced on the dataset
Access tab, the group Grants tab, and as a standalone query tool.

## Tab visibility on a collection detail page

Tab visibility follows from `collectionPolicies` in
`api/src/authorization/builtin/policies/collection.js`. The API returns the caller's
role and allowed actions in `_meta`, and the page shows a tab when the matching
capability is present. The same reasoning applies to datasets against `datasetPolicies`.

| Tab | Admin | Oversight | Grant holder | Any authenticated user |
|---|---|---|---|---|
| Overview | Full | Full, read-only | Public attributes only | Hidden |
| Datasets | Full | Full | With `COLLECTION:LIST_CONTENTS` | Hidden |
| Access (grants) | Full, can manage | Read-only | Hidden | Hidden |
| Requests | Incoming queue + own | Incoming queue, read-only, + own | Own requests only | Own requests only |
| Audit Log | Full | Read-only | Hidden | Hidden |

Four consequences follow.

**A grant holder's Overview is a trimmed layout.** `view_metadata` for a grant holder
is filtered to `PUBLIC_ATTRIBUTES`: `id`, `name`, `slug`, `description`, `metadata`,
`created_at`, `updated_at`, `is_archived`, `_count.datasets`, and the owner group's own
public attributes. Grant and audit-event counts are not in that set, so those stat cards
must not render for a grant holder.

**The Datasets tab is gated on the grant, and its rows are gated again.** The tab needs
`COLLECTION:LIST_CONTENTS`. What a row may show about each dataset is governed by that
caller's per-dataset capabilities, which are usually narrower — file counts and sizes
require deeper access than `view_metadata`.

**The Requests tab never disappears.** `create` on `access_request` is `Policy.always`,
so any authenticated user can file a request, and `isRequester` always lets them see
their own. The tab holds two distinct views with two distinct audiences: the incoming
review queue, gated on `review_requests`, and the caller's own requests, which are
always available. Do not collapse them into one list.

**Access and Requests are different tabs on purpose.** "Access" is the grant table —
standing access, admin-managed. "Requests" is the user-initiated workflow for asking
for access. The labels should keep that distinction visible.

::: tip Related open item
`create` on `access_request` being `Policy.always` means a caller can file a request
against a resource they cannot see. That is tracked as a live enforcement hole, not a
design intent.
:::
