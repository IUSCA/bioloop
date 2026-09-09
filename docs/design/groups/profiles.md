---
title: Profiles
order: 8
status: active
implemented: partial
last_verified: 2026-09-08
---

::: warning Design record — active
**Partly built.** Everything on the API side has shipped: the profile columns, the
`view_profile` action, the anonymous principal, the grant subject-set fix, the profile and
avatar routes, and the public router. The UI has not, so a published profile is reachable
only by calling the API directly. This record continues
[Decision 3](./decisions.md#_3-a-public-principal-exists-and-everyone-is-renamed), which added
the `Public` principal and deferred the serving half to a separate piece of work.
:::

# Group and Collection Profiles

A profile is the readable front page of a group or a collection. It carries a picture, a
tagline, a markdown description, external links, a citation, and related publications.
Screens are drawn at [`/mockups/profile-screens.html`](/mockups/profile-screens.html).

**A profile is informational and never authorization-bearing.** Publishing a profile grants
nobody any access to data. Hiding a profile takes no access away. This separation is the
constraint the rest of the page is built to satisfy.

## Two asymmetries shape everything below

**A group is a subject. A collection is a resource.** `group.id` is a foreign key into
`subject`, and `collection.id` is a foreign key into `resource`. Grants run from a subject to
a resource. So a grant can name a collection, and no grant can ever name a group. No design
that expresses group visibility as a grant can be built.

**Profile visibility is therefore not a grant, for either resource type.** A collection could
express visibility as a grant of `COLLECTION:VIEW_METADATA` to the `Public` principal, and a
group could not. Two mechanisms for one switch is the worse outcome. Visibility is a column on
both, and the reasoning is in [Decision 1](#_1-visibility-is-a-column-not-a-grant).

## Schema

Four typed columns on `group`, three on `collection`, and three JSON keys under the
`metadata` column each already carries.

A field earns a typed column when a page header, a card, or a query reads it on its own. A
repeating list that nothing filters on stays in `metadata`, where the API validates its shape
on write.

```prisma
enum PROFILE_VISIBILITY {
  PRIVATE        // members, oversight admins, and platform admins only
  AUTHENTICATED  // any signed-in user
  PUBLIC         // anyone, including people who are not signed in
}

model group {
  // ...
  tagline            String?            @db.VarChar(120)
  about_md           String?
  avatar_key         String?
  profile_visibility PROFILE_VISIBILITY @default(PRIVATE)
}

model collection {
  // ...
  tagline            String?            @db.VarChar(120)
  about_md           String?
  profile_visibility PROFILE_VISIBILITY @default(PRIVATE)
}
```

`metadata` gains three keys on both models, and keeps the `type` key the group already uses
for its `lab`, `center`, `core`, and `project` badge.

```jsonc
{
  "links": [
    { "type": "website" | "ror" | "protocols" | "contact_email" | "other",
      "url": "https://cgb.indiana.edu",
      "label": "Facility website" }
  ],
  "citation": "Genomics Core Facility (2026). Genomics Core Facility. Bioloop, Indiana University. https://…",
  "publications": [
    { "doi": "10.1038/s41477-026-01847-2",
      "title": "Long-read assembly of twelve regional maize landraces",
      "container": "Nature Plants",
      "year": 2026 }
  ]
}
```

Four notes on the columns.

**`avatar_key` is an object-store key, not a URL.** The bytes live where dataset files live.
A collection has no picture, because a collection is displayed inside its owning group's
identity and a second logo competes with it.

**`citation` is generated when the column is null.** The generated form follows DataCite's
human-readable order: creator, year, title, publisher, identifier. An admin who sets the
column overrides the generated line. This is a display field, so a generated approximation is
the right answer and precision work is wasted.

**`publications` stores the resolved title and container, not only the DOI.** The list still
renders when the DOI resolver is unreachable. Resolution happens once, on write.

**`profile_visibility` defaults to `PRIVATE`.** Every existing row is private after the
migration, and becoming public is always a deliberate act by a group admin.

The migration is written by hand, following
[`.claude/skills/prisma-schema-changes/SKILL.md`](https://github.com/IUSCA/bioloop/tree/main/.claude/skills/prisma-schema-changes).
It adds the enum, the columns, and a `CHECK` constraint on `tagline` length. Prisma cannot
express the check, so the migration carries it and a test asserts it holds.

## What each audience sees

Three tiers, and one attribute list per tier.

| Tier | Who | Gets |
|---|---|---|
| Full | Group admin, oversight admin, platform admin | Every column |
| Member | Member of the group, or holder of a grant on the collection | The profile, plus counts, ancestors, and admin contact details |
| Profile | Any viewer the visibility setting admits, including anonymous | `PUBLIC_PROFILE_ATTRIBUTES` |

`PUBLIC_PROFILE_ATTRIBUTES` is a new exported constant beside the existing `PUBLIC_ATTRIBUTES`
in `api/src/authorization/builtin/policies/group.js` and `collection.js`.

```js
// group.js
const PUBLIC_PROFILE_ATTRIBUTES = [
  'id', 'name', 'slug', 'description', 'tagline', 'about_md', 'avatar_key',
  'metadata.type', 'metadata.links', 'metadata.citation', 'metadata.publications',
  'is_archived', 'profile_visibility',
];
```

`description` is on that list because it is already in `PUBLIC_ATTRIBUTES`, which every
signed-in user receives for every group in a listing. `tagline` and `avatar_key` join
`PUBLIC_ATTRIBUTES` for the same reason: a tagline sits at the sensitivity of the
description beside it, and the avatar route authorizes the bytes on its own.

The collection list adds `owner_group.id`, `owner_group.name`, and `owner_group.slug`,
because a citation is not usable without naming who published the collection.

A third constant, `PROFILE_ATTRIBUTES`, holds the profile columns a member or grant holder
gains on top of what they already saw, so the member arm and the public arm cannot drift.

Three things are deliberately absent, and each absence is a rule rather than an oversight.

**No counts.** `_count.members` sits in the existing `PUBLIC_ATTRIBUTES` and must not reach an
anonymous viewer. A member count is a fact about people, and a dataset count tells an outsider
how large a holding is.

**No personal email addresses.** The `admins[*].email` arm stops at the member tier. A group
publishes a shared inbox through a `contact_email` link when it wants to be reachable. An
opt-in shared inbox is a different thing from a harvestable list of staff addresses.

**No ancestry.** `ancestors[*]` describes the group hierarchy, which is internal structure.
The mockup shows the parent group to a signed-in non-member and withholds it from an anonymous
viewer.

## API

The authenticated routes stay where they are. Profile fields reach `GET /groups/:id` and
`GET /collections/:id` through the attribute rules those routes already apply.

| Method and path | Action | Notes |
|---|---|---|
| `PATCH /groups/:id/profile` | `group.edit_metadata` | Body carries `tagline`, `about_md`, `profile_visibility`, `links`, `citation`, `publications`. Optimistic lock on `version`. |
| `PUT /groups/:id/avatar` | `group.edit_metadata` | Multipart. Replaces `avatar_key`. |
| `DELETE /groups/:id/avatar` | `group.edit_metadata` | Clears `avatar_key`. |
| `PATCH /collections/:id/profile` | `collection.edit_metadata` | Same body, without `avatar_key`. |

Profile editing reuses `edit_metadata` rather than adding an `edit_profile` action. The policy
would be identical, `isGroupAdmin`, and a second action with the same policy gives a reader two
things to keep in step and tells them nothing.

The public routes are a new router at `api/src/routes/public.js`, mounted in
`api/src/routes/index.js` **above** the `router.use(authenticate)` line.

| Method and path | Action | Notes |
|---|---|---|
| `GET /public/groups/:id` | `group.view_profile` | 404 when the group is not `PUBLIC`. |
| `GET /public/collections/:id` | `collection.view_profile` | 404 when the collection is not `PUBLIC`. |
| `GET /public/groups/:id/avatar` | `group.view_profile` | Image bytes, `Cache-Control: public, max-age=300`. |

Three properties of that router matter more than its contents.

**Every route on it is a GET.** A test walks the router stack and fails on any other method.

**Every route on it authorizes `view_profile`.** The same test reads `middleware.authorizes`,
which the authorization middleware already stamps on itself for exactly this purpose.

**A refusal is a 404, not a 403.** A 403 on a private group confirms the group exists. The
route answers the same way for a private group and for an id that was never issued.

**The canonical public URL carries the id, not the slug.** `group.slug` is regenerated whenever
the group is renamed, so a slug in a published citation breaks on the next rename. The routes
accept a slug and redirect to the id form.

## Authorization

One new action, two new policy terms, and one new principal. The engine's core is not touched.

### The `view_profile` action

```js
// group.js
const isProfilePublic = new GroupPolicy({
  name: 'isProfilePublic',
  requires: { resource: ['profile_visibility'] },
  evaluate: (user, group) => group.profile_visibility === 'PUBLIC',
});

const isProfileVisibleToSignedInUser = new GroupPolicy({
  name: 'isProfileVisibleToSignedInUser',
  requires: { user: ['is_anonymous'], resource: ['profile_visibility'] },
  evaluate: (user, group) => user.is_anonymous !== true
    && ['PUBLIC', 'AUTHENTICATED'].includes(group.profile_visibility),
});

view_profile: Policy.or([
  isGroupAdmin,
  isGroupMember,
  hasGroupOversight,
  canAccessResourcesOwnedByGroup,
  isProfilePublic,
  isProfileVisibleToSignedInUser,
]),
```

**Attribute rules short-circuit on the first matching policy; they do not combine.** An
action-specific rule list also replaces the `'*'` wildcard block entirely rather than adding
to it. So the `view_profile` rules are written out in full, most privileged first, and the
last arm is `Policy.always` — everything reaching attribute evaluation has already been
granted the action, so the catch-all needs no condition of its own.

`is_anonymous` is registered as a virtual attribute on `userHydrator` that returns `false`. A
real user never carries the field, so the loader answers for them; the anonymous principal
supplies `true` through `preFetched` and the loader never runs.

The collection policies take the same two terms against `collection.profile_visibility`, added
to the existing `view_metadata` arms.

`view_profile` must be added to `READING_ACTIONS` in
`api/src/authorization/builtin/restrictions.js`. A test asserts that every registered action
appears in `READING_ACTIONS` or `MUTATING_ACTIONS`, and it fails until the entry exists. An
archived group keeps serving its public profile, because `ARCHIVED` blocks mutation only.

### The anonymous principal

An unauthenticated request reaches the engine as a subject with no memberships, no grants, and
no roles.

```js
// api/src/constants.js
const ANONYMOUS_PRINCIPAL = Object.freeze({
  subject_id: PUBLIC_GROUP_ID,
  is_anonymous: true,
  roles: [],
  group_memberships: [],
  effective_group_ids: [],
  oversight_group_ids: [],
  accessible_owner_group_ids: [],
});
```

A new `optionalAuthenticate` middleware sets `req.user` to this object when no token is
present, and behaves exactly like `authenticate` when one is. The public router uses it.

This shape is chosen because it needs no change to `api/src/authorization/core/`. Three places
in the core refuse a missing user, and the principal satisfies all three:
`authorizeWithFilters` throws when `identifiers.user` is nullish, `evaluateCapabilitySet`
throws on the same condition, and the context hydrator returns an empty grant set. Every
membership policy evaluates `false` against the empty arrays, and `isPlatformAdmin` evaluates
`false` against the empty role list.

The principal costs no database reads. `PrismaHydrator.hydrate` merges `preFetched` into the
shared request cache before deciding what to fetch, so every user attribute the group and
collection policies declare is already present. Capability derivation reads the same cache.

### A defect this work must fix first

**An anonymous caller currently resolves grants made to `Authenticated Users`.**

`SYSTEM_PRINCIPALS_SQL` in `api/src/services/grants/helpers.js` unions both system principals
into the subject set of every grant query, unconditionally. The union is correct for a
signed-in user, because `Public` is the wider audience and contains the authenticated one. It
is wrong in the other direction. Run against the anonymous principal, the same SQL would hand
an anonymous caller every grant made to `Authenticated Users`.

The subject-set builders take the principal set as an argument. An anonymous caller gets
`{ Public }`; a signed-in caller keeps `{ Public, Authenticated Users }`. A test grants
`Authenticated Users` a collection access type and asserts the anonymous principal does not
resolve it.

This is worth fixing before any route can be reached without a token, not after.

### Rate limiting and caching

The public router carries `express-rate-limit`, pinned at 7.5.1 because that line has no
runtime dependencies of its own and peers Express 4. The limit is 60 requests per minute per
address. A person reading one profile issues a handful of requests, so
the limit sits two orders of magnitude above ordinary use, and far below the rate a scraper
enumerating ids would need.

Public responses carry `Cache-Control: public, max-age=300`. Five minutes is short enough that
an admin who switches a profile back to private sees it disappear while they are still at the
keyboard.

**Public profile reads are not audited.** An `authorization_audit` row records which subject
did what, and an anonymous row names no actor. The volume is also unbounded by anything the
system controls.

## The UI

The authenticated pages keep their shape. The Overview tab of
`ui/src/pages/v2/groups/[id]/index.vue` becomes the profile, and the definition list it shows
today moves into a *Details* card in the right rail.

The public page is new, at `ui/src/pages/public/groups/[id].vue`, carrying
`meta: { requiresAuth: false }`. The router already honours that flag. It renders the same
profile components inside a layout with no sidebar and no navigation.

The public page cannot use `ui/src/services/api.js`. That client redirects to `/auth/logout` on
any 401, which would throw a signed-out reader out of a page built for signed-out readers. The
public page uses its own axios instance with no interceptors.

## Decisions

### 1. Visibility is a column, not a grant

**Decision.** `profile_visibility` is an enum column on `group` and `collection`. A grant never
expresses profile visibility.

The alternative was a grant of `COLLECTION:VIEW_METADATA` to the `Public` principal. It fits
the existing model, it needs no new column, and the effective-access SQL already honours the
principal.

It was rejected for two reasons. A group is a subject and cannot receive a grant, so the
alternative covers half the feature and leaves the other half needing a column anyway. And a
grant is an authorization record. Expressing visibility as a grant would make the profile
authorization-bearing, which is the one thing this feature is not allowed to be.

The cost is real. An admin now has two switches with adjacent meanings: a public profile, and a
grant to `Public`. The UI names them differently and says which one moves data.

### 2. The anonymous caller is a principal, not a second code path

**Decision.** An unauthenticated request runs through the same authorization engine as every
other request, carrying a frozen principal with empty memberships.

The alternative was a public read path that never enters the engine: a service function that
checks the visibility column and returns a hand-written projection.

It was rejected because it creates two places that decide what a viewer may see. The two drift,
and the one that drifts is the one nobody exercises. Keeping one engine means the attribute
rules stay the single authority on which fields leave the building.

The cost is that a principal object now exists which is not a person. The mitigations are that
it is frozen, that it reaches only GET routes on one router, and that a test enumerates that
router.

### 3. A public profile omits counts and personal addresses

**Decision.** `PUBLIC_PROFILE_ATTRIBUTES` excludes every `_count` field, every `email` field,
and the ancestor list.

Zenodo and dbGaP both publish that a restricted thing exists and gate the data itself, which is
the pattern the collection profile follows for a signed-in viewer. It does not follow that
every number is safe for an anonymous one. A member count describes people who did not choose
to be counted in public, and an admin email list is worth harvesting.

### 4. A signed-in viewer is told what they cannot see; an anonymous one is not

**Decision.** The collection profile shows a signed-in viewer `8 of 20 visible to you` and a
strip naming the 12 they cannot open. A public profile shows no dataset count at all.

The count is a disclosure either way. For a signed-in viewer it is the disclosure that makes a
request worth making, and the requester is identified. For an anonymous viewer it discloses the
size of a holding to somebody the system cannot name.

This one is worth revisiting with a real group. It is the decision most likely to be wrong.

### 5. The Overview tab becomes the profile

**Decision.** The profile replaces the Overview tab rather than adding a seventh tab.

Every comparable platform puts the readable page first: a GitHub organisation README, an OSF
wiki, a Zenodo community about page. A seventh tab is cheaper to build and puts the
outward-facing page one click behind the internal one.

The demoted definition list keeps every row for an admin. A non-member loses the rows that
describe governance, such as `allow_user_contributions`.

## What this does not do

**No public listing or search.** There is no `GET /public/groups`. A public profile is
reachable by its URL and by whatever indexes it from outside. A public directory is a separate
decision about discoverability.

**No public dataset pages.** `dataset.view_profile` does not exist. Datasets carry file paths
and consent codes, and a public dataset page needs its own analysis of what is safe.

**No profile for a user.** Only groups and collections have profiles.

**No custom theming.** Dataverse gives a collection a logo, colours, and a footer. Bioloop gives
it a picture and text. Colour customisation makes every profile a small design project and
every screenshot ambiguous.

## Open questions

**Does a public group profile list its public collections?** The mockups do not show it. It is
the one link that makes a public profile useful for discovery, and it needs the same count
decision as [Decision 4](#_4-a-signed-in-viewer-is-told-what-they-cannot-see-an-anonymous-one-is-not).

**Who may set `PUBLIC`?** The design lets a group admin do it alone. Publishing a page under
the institution's domain may warrant a platform-admin review step.

**Is markdown rendered on the server or the client?** The repository already sanitises HTML
with DOMPurify in `api/src/routes/about.js`. Rendering markdown on the client keeps the stored
value honest, and it puts the sanitiser in the browser.

## Related records

- [Decisions](./decisions.md) — Decision 3 added the `Public` principal and deferred this work
- [Design](./design.md) — how groups, collections, and grants fit together
- [UI information architecture](./ui-information-architecture.md) — where these pages sit
- [Code map](./code-map.md) — where the authorization engine lives
