---
title: UI Information Architecture
order: 8
status: active
implemented: partial
last_verified: 2026-09-03
---

::: warning Design record — active
The page structure the [groups design](./design.md) is meant to be operated through.
Some of this is built and some is not. For what the code does today, see
[Code Map](./code-map.md).
:::

# UI Information Architecture

This record fixes the top-level page structure, the tabs on each detail page, and the
rule for deciding which tabs a given caller sees. It exists so that every resource page
is laid out the same way and so that tab visibility follows from the authorization
model rather than from per-page judgement.

Visual mockups of these screens are vendored at
[`docs/public/mockups/`](https://github.com/IUSCA/bioloop/tree/main/docs/public/mockups) —
`ui-design.html` is the design spec, and the others show the portal, dashboards, grant
views, and creation flows. `dashboard-screens-mvp.html` covers the landing page and
names what it deliberately does not draw; `dashboard-screens.html` is the earlier, wider draw of it. `dataset-creation-screens.html` covers the import and upload
dialogs, their in-flight states, and the refusals each one can show. `profile-screens.html` covers the
group and collection profile pages, including what a signed-out reader sees.
`overview-redesign.html` redraws the Overview tab of a group and of a collection as a summary
band over a wide panel and a thin one, drops the count tiles the tab bar already carries, and
draws the same page to an admin, a member, and a signed-out reader so that what sits above the
fold follows from what each one came to do. They are snapshots of intent, not of shipped UI.

## Top-level pages

Seven areas make up the portal.

- **Dashboard** — what needs the caller, and what they can reach. See [Dashboard plan](./dashboard-plan.md).
- **Groups** — hierarchy, membership, archival.
- **Datasets** — ownership, grants, collection membership, lifecycle.
- **Collections** — dataset containers and grant targets.
- **Grants** — cross-resource grant browsing and issuance.
- **Access Requests** — the request, review, and decision workflow.
- **Audit Log** — the immutable event stream, platform admin only.

## Page map

```
├── / (dashboard: sections gated by persona — see the dashboard plan)
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
│   ├── Inbox — three tabs: pending my review, reviewed by me, and my own requests
│   └── Detail view per request (submit view, review view, resolved view)
│
├── /grants
│   ├── /grants  (browse & search)
│   └── Issue grant modal (used from several places)
│
└── /audit-log  (global event stream, platform admin only)
```

## The Overview tab

The Overview tab of a group and of a collection has one shape, in three parts, top to
bottom.

**The summary band** is one card directly under the tabs, holding the facts in a single
row. The band carries no prose. A group's or collection's one-line summary is its `tagline`,
which the page header already prints under the name, and its long form is `about_md`, which
`ProfileAbout` renders in the wide panel below. Repeating either one in the band would say
the same thing twice on one screen.

A fact whose value the caller may change is the control that changes it. Member uploads is
the first of these: for a caller who may edit the group it is a button that opens the
metadata modal, and for everyone else it is text. A setting whose only edit path is a modal
two clicks away gets read as a fact about the world rather than as a choice somebody made.

Which facts appear follows from what the API returned, not from a permission check written
in the UI. A caller who is not a member of a group never receives `allow_user_contributions`,
so the member-uploads cell disappears on its own. The band therefore carries four cells for
an admin and fewer for a reader with a narrower attribute filter, without the component
knowing anything about roles. A fact the page header already states is not repeated: a
collection names its owning group in the header, so the band does not.

**The wide panel** says what the resource is. It holds, in order: the needs-attention row,
the profile, the publications, and then the admins card beside the ancestry tree. Cards in
this panel may be full width or paired side by side. The admins-and-ancestry row keeps two
columns even on a root group, which has no ancestry card, so that the admins card is the
same width everywhere rather than stretching across the panel on one page and not another.

**The thin panel** says what the caller can do and how to refer to the resource: quick
actions, links, citation. Quick actions is first because a grouped panel that falls below
the fold is a panel nobody uses. The citation is last for a caller who has actions, and
first for one who has none, because it is what that reader is least likely to need next.

Three rules keep the layout honest.

- **Nothing on Overview repeats a tab.** The tab bar already prints every count, so the tab
  bar is where counts live. A preview list of subgroups is not offered, because Subgroups is
  a tab.
- **The needs-attention row renders only when a count is non-zero**, and only when the count
  means work waiting on this caller. A collection's request count is pending-review for a
  reviewer and the caller's own requests otherwise, so the row is gated on the review
  permission rather than on the number.
- **Both panels are always present**, including on a resource with no profile written. The
  wide panel then holds the profile prompt and the admins card rather than the page
  collapsing into a different layout for an empty state. A collection has no admins card
  yet, so its prompt shows whenever it has no About body and no publications, even when a
  tagline is written.

Archiving is the last item in the quick actions panel, in red below a rule, rather than a
bordered card of its own. It is a once-in-a-resource's-life action, and the panel is where a
caller already looks for things they can do; the rule and the tone say it is not one of the
everyday ones, and the confirmation modal is the real guard.

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

## Access types in forms

Two forms offer access types: the request form and the grant dialog. Both list the same
types, in the same order, under the same headings.

**Order.** Each access type carries a `category` and a `sort_order`, both seeded from
`GRANT_ACCESS_TYPES` in `api/src/constants.js`. The category is a Postgres enum, and
Postgres sorts an enum in declaration order. `GET /grants/access-types` sorts by category
and then by `sort_order`. The headings are *This collection*, *About the dataset*,
*Files*, and *Use the data*, in that order. Narrower access comes first under each heading.
On a collection, the dataset headings sit under *Datasets in this collection*. A dataset
type issued on a collection applies to the datasets the collection holds.

**Labels.** An access type's `description` is its short label, such as "Browse file tree".
Its `name` is its identifier, such as `DATASET:LIST_FILES`. Every surface leads with the
label. Surfaces an admin reads also show the identifier as small gray text. Those are the
grant dialog, the Access tab, the review queue, the revoke dialogs, and the grant preview.
The request form and a requester's own panels show the label alone.

**Requestable types.** `is_requestable` is false for a type that only an admin grants
directly. `DATASET:VIEW_SENSITIVE_METADATA` is the one such type. The request form omits
it. `POST /access-requests` refuses it with a 400, whether the request names it directly or
through a preset. The grant dialog offers every type.

**Access already held.** The request form loads what the chosen person or group already
holds, by any path. The selector shows each held type, and every type it implies, ticked
and disabled. A short reason sits beside it, such as "You have this through Wong Lab".

**Wording.** People who ask and admins who grant read the same forms, so both forms use one
vocabulary. They say "Who needs access", "For how long", and "Everyone signed in". They do
not say "subject", "expiry", or "system principal". Only the framing differs between the
two forms.

## Tab visibility on a collection detail page

Tab visibility follows from `collectionPolicies` in
`api/src/authorization/builtin/policies/collection.js`. The API returns the caller's
role and allowed actions in `_meta`, and the page shows a tab when the matching
capability is present. The same reasoning applies to datasets against `datasetPolicies`.

| Tab | Admin | Oversight | Grant holder | Any authenticated user |
|---|---|---|---|---|
| Overview | Full | Full, read-only | Public attributes only | Hidden |
| Datasets | Full | Full | With `COLLECTION:LIST_CONTENTS` | Hidden |
| Access (grants) | Full, can manage | Read-only | Own access only | Hidden |
| Requests | Incoming queue + own | Incoming queue, read-only, + own | Own requests only | Own requests only |
| Audit Log | Full | Read-only | Hidden | Hidden |

The consequences follow.

**A grant holder's Overview is a trimmed layout.** `view_metadata` for a grant holder
is filtered to `PUBLIC_ATTRIBUTES` plus `PROFILE_ATTRIBUTES`: `id`, `name`, `slug`,
`description`, `metadata`, `created_at`, `updated_at`, `is_archived`, `_count.datasets`,
`tagline`, `about_md`, `profile_visibility`, and the owner group's own public attributes.
The UI draws no `description`; the attribute stays in the set because the API still returns
the column.
Grant and audit-event counts are not in that set, so those stat cards must not render for a
grant holder.

The profile work added the last three. A grant holder reads the profile body on the ordinary
Overview tab, without `view_profile` being involved, because they already hold a grant on the
collection. `view_profile` exists for the caller who holds no grant at all, including one who
is not signed in. @see [Profiles](./profiles.md) — What each audience sees.

**The Datasets tab is gated on the grant, and opening a row is gated again.** The tab needs
`COLLECTION:LIST_CONTENTS`. It lists every dataset in the collection, with each dataset's
public attributes. Opening a dataset needs `DATASET:VIEW_METADATA`, and no collection access
type implies it. `GET /collections/:id/datasets` therefore gives each row
`_meta.capabilities` and `_meta.standing`, the same shape a dataset's detail route returns.
The tab shows a row without `view_metadata` as plain text, not as a link. The tab shows the
Stage button and the row checkboxes only when some row on the page has `request_stage`, the
action the stage route checks.

**A browsable collection offers the next step.** When any row will not open, the tab offers a
request for access on the collection. That request may name dataset access types, because
they are valid on a collection. The `Discoverable` preset never reaches this state. It issues
`DATASET:VIEW_METADATA` on the collection together with `COLLECTION:LIST_CONTENTS`.

**A list row always opens.** The dataset list and the collection list count a grant only
when its type satisfies the page's `view_metadata` check, after the access-type order is
applied. `api/tests/services/grants/listVisibility.test.js` asserts the lists and the pages
agree for each grant shape. @see [Decisions](./decisions.md) — 7. Access types imply one another.

**The Requests tab never disappears.** `create` on `access_request` is `Policy.always`,
so any authenticated user can file a request, and `isRequester` always lets them see
their own. The tab holds two distinct views with two distinct audiences: the incoming
review queue, gated on `review_requests`, and the caller's own requests, which are
always available. Do not collapse them into one list.

**Access and Requests are different tabs on purpose.** "Access" is the grant table —
standing access, admin-managed. "Requests" is the user-initiated workflow for asking
for access. The labels should keep that distinction visible.

**A grant holder's Access tab explains their own access.** It lists each grant that reaches
the caller on this resource, and the path it arrives by. A path is a direct grant, a group
the caller belongs to, a system principal such as `Public`, or a collection holding the
dataset. It never lists another subject's grants. The tab reads
`GET /grants/USER/:subject_id/:resource_type/:resource_id/coverage`, which `view_coverage`
allows for the subject themselves. The same rule applies on a dataset page.

Coverage explains grants only. An admin or an overseer holds access through group structure,
which no grant row records. Those callers see the full grant table instead.

::: tip Related open item
`create` on `access_request` being `Policy.always` means a caller can file a request
against a resource they cannot see. That is tracked as a live enforcement hole, not a
design intent.
:::
