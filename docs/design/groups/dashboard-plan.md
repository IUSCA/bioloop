---
title: Dashboard plan
order: 10
status: active
implemented: partial
last_verified: 2026-09-09
---

::: warning Design record — active
The ordered work for the landing page at `/v2/home`. The page structure it sits inside is
[UI information architecture](./ui-information-architecture.md), and the visual rules are
[V2 design system](../../contributing/v2-design-system.md). Screens are drawn at
[`/mockups/dashboard-screens-mvp.html`](/mockups/dashboard-screens-mvp.html). The earlier
[`dashboard-screens.html`](/mockups/dashboard-screens.html) is kept as it was drawn, and it
shows more than this plan builds.
:::

# Dashboard plan

## What this page is for

The dashboard answers one question for whoever opens it: what needs me, and what can I
reach. Nothing else belongs on it. Every list page in the portal already browses and
filters its own resource, so the dashboard never duplicates a listing. It shows the small
set of rows a person acts on today, and links to the page that holds the rest.

## Status

Phases 1 to 4 are built. Phase 5 is the API work the deferred panels wait on, and none of
it is in the first release.

Every call the page makes was driven against the running API once per persona, and three
live defects turned up that no test covered.

- `GET /grants/expiring-soon` and `GET /grants/mine` were unreachable. Express matches in
  registration order and both sat below `/grants/:id`, so every request to them was
  rejected as a malformed UUID. Both now sit above it.
- `GET /groups/without-active-admin` returned 500 on every call. The route asked for
  `getGroupsWithoutActiveAdmin` and the service exports `getGroupsWithoutActiveAdmins`.
- `GET /grants/expiring-soon` dropped the subject from every row, because the route
  destructured `source` where the service returns `subject`.

## The state this plan started from

**`/v2/home` rendered nothing.** Its template read `dashboard.loading` and
`dashboard.isGroupAdmin`, and its `<script setup>` never defined `dashboard`. The group
admin dashboard underneath had been written, and the role detection that would reach it
was commented out. So no user of any kind saw a dashboard.

Three of the five calls that dashboard made were wrong against the API.

- `AuditLogsService.getAuditRecords` returns 403 for anyone but a platform admin. The
  audit route was gated after the dashboard was written. A group admin's activity feed has
  no endpoint behind it at all.
- `GrantsService.expiringGrants` returns a plain array grouped by subject and resource, and
  the page read `.data.data` and `.data.metadata.total`, which are both undefined.
- `/grants/expiring-soon` accepts only `within_days`. The page passed `limit`, `sort_by`,
  and `sort_order`, and all three were ignored.

The page also imported the legacy `@/services/dataset` for `getStats()`. That is a v2 page
calling a v1 domain service, which the [v2 cut-over](../v2-cutover.md) forbids.

## What changed since the mockup was drawn

The mockup and the backlog item both predate a run of work that moved several of their
open problems. Each item below was confirmed by reading the code, not the backlog.

**Persona detection is a served value.** `GET /v2/users/me` returns `uiPersona` as
`platform_admin`, `group_admin`, or `standard_user`, and `stores/v2/uiPersona.js` already
wraps it. Two other pages use the store. The dashboard does not need to infer a role from a
group search.

**The datasets a caller can reach is one query.** `GET /v2/datasets?scope=grants` returns
every dataset reachable through a grant, including grants made to a group the caller
belongs to and grants made to a collection holding the dataset. The backlog item says this
convenience does not exist; it does.

**A group listing labels how the caller reaches each group.**
`POST /groups/search` with `scope: 'all'` returns `user_role` on every row, valued `ADMIN`,
`MEMBER`, `OVERSIGHT`, or `TRANSITIVE_MEMBER`, plus `size` as the member count. `RoleBadge`
already maps all four. The member view's transitive-membership note needs no new endpoint.

**An access request carries its own access summary.** Every one of the three request
listings runs `withGrantCounts`, so each row arrives with `access_summary`. `AccessRequestCard`
renders the summary and turns `APPROVED` with no live grant into a sentence that says so.
The dashboard reuses that card rather than carrying its own.

**The request detail page exists** at `pages/v2/access-requests/[id].vue`. The dashboard's
`viewRequest` TODO is closeable. There is still no grant detail page and no `/v2/grants`
page, so `viewGrant` stays open.

**Recently updated datasets is one query.** `GET /v2/datasets` takes `scope=ownership`,
`sort_by=updated_at`, and `sort_order=desc`. The backlog item defers this panel for want of
exactly that combination.

## The gap only the dashboard closes

**A person cannot see their own access requests anywhere.** `/v2/access-requests` has two
tabs, "Pending review" and "Reviewed", and both are reviewer surfaces. `requested-by-me` is
called from four places and every one of them is scoped to a single resource. So a
researcher who files a request has no page that lists what they asked for.

This is use case 8, which is `MVP`, and it is the strongest single argument for building
the member view first.

**An empty portal explains nothing.** Zero-default access means a user with no grants sees
empty pages everywhere, which reads as a broken system. That is risk 8 in
[Trust and communication](./trust-and-communication.md). The dashboard is where the
explanation goes, because it is the page such a user lands on.

## One page, not three

The mockup draws three disjoint screens. This plan builds one page from a catalogue of
sections, each rendered when the caller's persona and data warrant it.

The reason is that the personas are not disjoint people. A group admin files access
requests and holds grants like anyone else, and the mockup's group admin screen gives them
no view of either. A platform admin belongs to groups. Composing sections keeps one
implementation of each panel and lets a person see everything true of them.

Three rules fix what renders.

- Personal sections render for every persona: my requests, my access, and my groups.
- Governance sections render for `group_admin` and `platform_admin`: the review queue,
  expiring grants, and the datasets they govern.
- Platform sections render for `platform_admin` alone: system totals, groups without an
  active admin, and recent activity.

Governance sections sit above personal ones for an admin, because the review queue is the
thing that needs them today.

## What ships, and the query behind it

A stat with no real query behind it is left out rather than filled with a placeholder. Each
row below names the call that produces it.

| Section | Query | Renders for |
|---|---|---|
| Persona and hero | `GET /v2/users/me`, `POST /groups/search` | all |
| Needs your review | `GET /access-requests/my-pending-reviews` | admins |
| Grants expiring soon | `GET /grants/expiring-soon?within_days=30` | admins |
| Datasets I govern | `GET /v2/datasets?scope=ownership&sort_by=updated_at` | admins |
| Groups I administer and oversee | `POST /groups/search` scopes `admin` and `oversight` | admins |
| My access requests | `GET /access-requests/requested-by-me` | all |
| Datasets I can reach | `GET /v2/datasets?scope=grants` | all |
| My groups | `POST /groups/search` scope `all` | all |
| Groups without an active admin | `GET /groups/without-active-admin` | platform admin |
| Platform totals | three searches at `limit: 1`, read `metadata.total` | platform admin |
| Recent activity | `GET /audit/records` | platform admin |

Two call notes that cost a session if missed. `POST /groups/search` validates `limit` as
`min: 1`, so a count-only call passes `limit: 1` and reads `metadata.total`; `limit: 0` is
rejected. `GET /grants/expiring-soon` returns an unpaginated array of
`{ subject, resource, grants }`, so the stat card counts the array and the panel slices it.

## What is cut, and why

Each of these appears in the mockup and does not ship. The reason is the same in every
case: no query produces it, so building it means inventing a number.

**Every delta.** "↑ 2 since yesterday" and "2 added this month" need a time series that
nothing records.

**Active grants scoped to my groups.** `GET /grants/resource/:type/:id/count` counts one
resource. No endpoint aggregates across the resources a caller governs.

**Aggregate membership counts.** "8 members · 4 direct · 4 transitive" has no query. The
per-group `size` on a search row does exist, so a group row shows its own member count and
no stat card sums them.

**Discoverable datasets to request.** Dataset search returns only rows the caller can
already reach. Use case 2, finding a dataset you do not yet have access to, is unbuilt.
Without it the panel would list datasets the user already has, under a heading offering to
request them.

**A platform-wide pending request queue.** `my-pending-reviews` is scoped to the caller as
reviewer, and no route lists every open request. A platform admin sees the requests they
review, not all of them.

**Stale request alerts.** Nothing computes "unreviewed for more than seven days".

**A group admin's activity feed.** `GET /audit/records` is platform admin only, by design,
because the records span the whole platform. Scoping the audit query to a caller's
authority is its own piece of work.

**The quick actions grid.** Create subgroup, new collection, grant access, and add member
all need a target group, and every modal behind them is opened from a group page. A grid of
four buttons that each open a group picker first is worse than the group page it would send
the user to.

**The compact group tree.** `/groups/hierarchy` exists, and `/v2/groups` already renders
it. The dashboard links there.

**The source of each accessible dataset.** The mockup writes "via AI Lab membership" on
every row. Answering that per row costs one `GET /grants/…/coverage` call per dataset. The
row shows the owning group and links to the dataset, whose Access tab already explains the
source properly.

## Phases

### Phase 1 — the page renders, and it knows who is looking

Delete the undefined `dashboard` reference and drive the page from `useUIPersonaStore`.
Remove the `@/services/dataset` import and the legacy landing block underneath it. Bring
`DashboardHero`, `DashboardSection`, and `DashboardStatRow` onto the design system in the
same pass: `gray` rather than `slate`, `RoleBadge` for the role pill rather than a
hand-rolled one, `border-solid` on every border, and the documented type scale.

Ship the standard-user branch in this phase, so that every persona has a page that renders
before any of them has a good one.

Done when a signed-in user of each persona sees a hero, a stat row, and no console error.

### Phase 2 — the personal sections

Build three sections that render for every persona.

**My access requests** lists the caller's own requests from `requested-by-me`, newest
first, capped at five, using `AccessRequestCard` so the access summary comes along. Delete
`DashboardRequestCard`, which duplicates it without the summary.

Its "View all" link needs somewhere to go, so this phase also adds a third tab, "My
requests", to `/v2/access-requests`. That page has two tabs today, "Pending review" and
"Reviewed", and both are reviewer surfaces.
[UI information architecture](./ui-information-architecture.md) already calls for the
inbox to hold the caller's own submitted requests beside the queue. The tab is the same
`AccessRequestCard` list with the same query and a different default sort.

**Datasets I can reach** lists `scope=grants` with `include_owner_group=true`, capped at
five, each row linking to the dataset.

**My groups** lists `scope: 'all'` and renders `RoleBadge` from `user_role`, so a
transitive membership is labelled as one. A short note under the panel says that membership
of a group makes you a member of its ancestors.

Then write the three empty states risk 8 asks for. *Nothing yet* when a caller has filed no
requests. *No access* when the accessible-datasets query returns zero, saying plainly that
access is requested rather than assumed, and linking to the datasets page. *Nothing here*
when the platform genuinely holds nothing.

Done when a seeded user with no grants lands on a page that explains their position and
offers the next step.

### Phase 3 — the governance sections

Render these above the personal sections for `group_admin` and `platform_admin`.

**Needs your review** lists `my-pending-reviews`, oldest first, capped at five, using
`AccessRequestCard`, each row opening the request detail page.

**Grants expiring soon** consumes the grouped array from `/grants/expiring-soon` as it is
actually shaped. Rewrite `DashboardGrantRow` around `{ subject, resource, grants }`, or
delete it and render the group inline. The stat card counts the array length.

**Datasets I govern** lists `scope=ownership` sorted by `updated_at`, capped at five.

**The hero** names the groups the caller administers and the count they oversee, from two
searches at `scope: 'admin'` and `scope: 'oversight'`. Oversight is labelled read-only
wherever it appears, per risk 4.

Done when a group admin sees a review queue that matches `/v2/access-requests`, and no
request in this section 403s.

### Phase 4 — the platform sections

Render these for `platform_admin` alone, above everything else.

**Platform totals** for groups, collections, and datasets, each from a search at `limit: 1`
reading `metadata.total`.

**Groups without an active admin** from `/groups/without-active-admin`, each row linking to
the group's members tab. This is the one governance alert with a service behind it.

**Recent activity** from `/audit/records`, capped at five, linking to the audit log page.

Done when a platform admin sees the two alerts that have queries, and no alert that does
not.

### Phase 5 — what the API has to grow first

Each item names the endpoint it waits on, and none of them is in the first release.

- **Active grants and membership counts** scoped to a caller's groups need an aggregate
  count endpoint. Two stat cards follow.
- **A grant detail page** closes the remaining dead link. `/v2/grants` does not exist
  either, and [UI information architecture](./ui-information-architecture.md) calls for
  both. Until it does, a grant row on the dashboard links to the resource rather than to
  the grant.
- **Discover and request** needs use case 2, a search over datasets the caller cannot yet
  reach, with metadata and data separately gated.
- **A group admin activity feed** needs the audit query filtered by the caller's authority
  rather than gated on platform admin.
- **A platform-wide request queue** needs a listing that is not scoped to one reviewer.
- **Quick actions** need the create modals to be openable without a group already in
  context.

## Testing

The API calls are all existing endpoints with existing tests, so the risk is in the
composition rather than in the data.

Drive the page in the browser once per persona, following the
[`v2-ui-changes`](https://github.com/IUSCA/bioloop/blob/main/.claude/skills/v2-ui-changes/SKILL.md) skill. Sign in as a group
admin rather than a platform admin, because the engine allows a platform admin before any
policy runs. Confirm for each persona that every section either renders rows or renders its
empty state, and that the network panel shows no 403.

Measure the claim rather than reading the template. One `evaluate_script` returning the
section headings, their row counts, and their computed border widths carries the whole
check.
