---
title: UI Information Architecture
order: 8
status: active
implemented: partial
last_verified: 2026-09-17
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

- **Dashboard** — what needs the caller, and what they can reach. See [Dashboard](#dashboard).
- **Groups** — hierarchy, membership, archival.
- **Datasets** — ownership, grants, collection membership, lifecycle.
- **Collections** — dataset containers and grant targets.
- **Grants** — cross-resource grant browsing and issuance.
- **Access Requests** — the request, review, and decision workflow.
- **Audit Log** — the immutable event stream, platform admin only.

## Page map

```
├── / (dashboard: sections gated by persona — see Dashboard below)
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

## Dashboard

The dashboard at `/v2/home` answers one question: what needs me, and what can I reach. Every
list page already browses and filters its own resource, so the dashboard never repeats a
listing. It shows the few rows a person acts on today and links to the page holding the rest.

**It closes two gaps no other page closes.** It is the page a person lands on, so it lists
their own access requests without a detour to the Access Requests area. It also explains an
empty portal. Zero-default access means a caller with no grants and no groups sees empty
pages everywhere. The dashboard tells that caller that access is given rather than assumed,
and offers a way to browse what they can see. See
[Trust and communication](./trust-and-communication.md) — risk 8.

**One page, composed from sections.** The personas are not disjoint people. A group admin
files requests and holds grants like anyone else, and a platform admin belongs to groups. So
one page renders every section that is true of the caller, and each panel has one
implementation. Three rules decide what renders, read from `GET /v2/users/me`.

- **Platform** sections render for a platform admin: platform totals, groups with no active
  admin, and recent activity. They sit on top.
- **Governance** sections render for anyone who administers or oversees a group, and for a
  platform admin: needs your review, access expiring soon, groups I administer, and datasets
  I govern. They sit above the personal sections, because the review queue is what needs an
  admin today.
- **Personal** sections render for everyone: my access requests, my groups, and datasets I
  can reach.

The hero line names the caller's widest standing: platform admin, group admin, oversight, or
member. An overseer's hero and group rows say read-only.

**No stat without a query.** A number with no query behind it is left out, not filled with a
placeholder. The mockup draws several such panels, and each is cut for that reason. The API
work each one waits on is in `.todo/local/L4-dashboards.md`.

- Every delta, such as "2 added this month", because nothing records a time series.
- Active-grant and membership totals across a caller's groups, because only per-resource
  counts exist.
- Datasets to discover and request, because dataset search returns only reachable rows.
- A platform-wide pending queue, because `my-pending-reviews` is scoped to one reviewer.
- A stale-request alert, because nothing computes how long a request has waited.
- A group admin's activity feed, because `GET /audit/records` is platform admin only.
- A quick-actions grid, because every create modal needs a group already in context.
- A compact group tree. My groups links to the Groups area instead.
- The grant behind each reachable dataset, because it costs one coverage call per row. The
  dataset's Access tab answers it.

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

The add-member dialog shows its invite-by-email section to every caller holding `invite`,
whatever the user search returns. The search finds only people who have signed in, so an
empty result is normal for a new colleague. A section that appears only on an empty result
reads as an error.

## UX principles

Four principles apply across every page.

1. **Every access decision is explainable.** "Why does X have access?" is answerable
   inline. The UI shows the minimal grant and membership chain that caused the access.
   See [Explainability and Effective Access](./design.md#explainability-and-effective-access).
2. **Archived resources are visually distinct** everywhere they appear.
3. **Grant atomicity is abstracted by presets.** Raw grants stay available behind an
   "Advanced" toggle. See [Grant Presets](./design.md#grant-presets).
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

**What a request adds.** The request form previews what approval as asked would do.
`POST /access-requests/compute-effective-grants` takes the body filing takes, less `type` and
`purpose`, and writes nothing. It shares `previewIssue` with the reviewer's
`POST /grants/compute-effective-grants`, and differs from it in three ways.

- **Who may call it.** The reviewer's route needs `grant:create`. The requester's route runs
  the checks filing runs, `assertRequestable` and `assertMayRequestFor`.
- **What it returns.** `existingGrant` is cut to its `expiry` and `access_type`, because the
  whole row names who issued it and why.
- **What it says.** `EffectiveGrantsPreview` takes `perspective="requester"`, and reads "What
  this request adds", "Would be added", and "Already held".

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
| Requests | Incoming queue + own | Own requests only | Own requests only | Own requests only |
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
is not signed in. @see [Profiles — What each audience sees](./profiles.md#what-each-audience-sees).

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
`COLLECTION:VIEW_METADATA` and `DATASET:VIEW_METADATA` on the collection, and no
`COLLECTION:LIST_CONTENTS`. Its holder has no Datasets tab, and can open each dataset the
collection holds.

**A list row always opens.** The dataset list and the collection list count a grant only
when its type satisfies the page's `view_metadata` check, after the access-type order is
applied. `api/tests/services/grants/listVisibility.test.js` asserts the lists and the pages
agree for each grant shape. @see [Decisions](./decisions.md) — 7. Access types imply one another.

**The Requests tab never disappears.** A caller who can open the page already holds
`view_metadata` on the resource, which is what filing a request needs. `isRequester` always
lets them see their own requests. The tab holds two distinct views with two distinct
audiences: the incoming review queue, gated on `review_access_requests`, and the caller's own
requests, which are always available. Do not collapse them into one list. Oversight has no
review queue, because the queue selects only the admin path to a resource.

**Access and Requests are different tabs on purpose.** "Access" is the grant table —
standing access, admin-managed. "Requests" is the user-initiated workflow for asking
for access. The labels should keep that distinction visible.

**A request card opens the request.** `AccessRequestCard` is one row on the queue page and on
both resource tabs. The whole row opens the request detail page. The Review button shows only
when the row's `_meta` says the viewer holds `review` and the request's state admits it, which
means the request is `UNDER_REVIEW`.

**A decided request says what is still in force.** Every request listing runs
`withGrantCounts`, one grouped query for the page. Each row then carries `access_summary`.
It counts the grants naming the request as their source, split into live, revoked, and
expired. The three states are exclusive, so they sum to the number issued. The card says
"No live access from this request" when a decided request issued grants and none survives.
It stays silent while a request is under review, and when the request issued nothing.

**The request detail page explains the rest.** `GET /access-requests/:id` returns the
viewer's capabilities, because being able to read a request is not being able to review it.
A requester and an overseer can both read a request neither may decide. The page also runs
the coverage query, which a listing skips because it costs one query per request. An approved
item writes no grant when broader access already covers it, so the page lists what reaches
the subject by another path. `coverageAccessTypeIds` picks what to ask about. A decided
request asks about its approved items. An undecided one, in `DRAFT` or `UNDER_REVIEW`, asks
about every item.

**A grant holder's Access tab explains their own access.** It lists each grant that reaches
the caller on this resource, and the path it arrives by. A path is a direct grant, a group
the caller belongs to, a system principal such as `Public`, or a collection holding the
dataset. It never lists another subject's grants. The tab reads
`GET /grants/USER/:subject_id/:resource_type/:resource_id/coverage`, which `view_coverage`
allows for the subject themselves. The same rule applies on a dataset page.

A coverage query widens through the access-type order, so a lab's `DATASET:DOWNLOAD` grant
covers a question about `DATASET:LIST_FILES`. The grant preview attaches each coverage row to
every access type it answers for, not only to its own.

Coverage explains grants only. An admin or an overseer holds access through group structure,
which no grant row records. Those callers see the full grant table instead.

