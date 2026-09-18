---
title: Profiles
order: 10
status: active
implemented: partial
last_verified: 2026-09-17
---

::: warning Design record — active
The readable front page of a group or a collection, who may see it, and why visibility is a
column. For where each piece lives, see [Code Map](./code-map.md).
:::

# Group and Collection Profiles

A profile is the front page of a group or a collection. It carries a tagline, a markdown
body, external links, a citation, and related publications. Screens are drawn at
[`/mockups/profile-screens.html`](/mockups/profile-screens.html).

**A profile is informational and never authorization-bearing.** Publishing a profile grants
nobody access to data. Hiding one takes no access away.

## Two asymmetries

**A group is a subject, and a collection is a resource.** `group.id` is a foreign key into
`subject`, and `collection.id` is a foreign key into `resource`. Grants run from a subject to
a resource. So a grant can name a collection, and no grant can name a group.

**Profile visibility is therefore a column on both.** A collection could express visibility as
a grant of `COLLECTION:VIEW_METADATA` to `Public`, and a group could not. Two mechanisms for one
switch is the worse outcome. A grant is also an authorization record, which a profile must not
be. So `profile_visibility` is a `PRIVATE`, `AUTHENTICATED`, or `PUBLIC` column on `group` and
`collection`.

**The column has a cost.** An admin sees two switches with adjacent meanings: a public profile,
and a grant to `Public`. The UI names them differently and says which one moves data.

## The columns

`tagline`, `about_md`, and `profile_visibility` are typed columns on both models. Links,
citation, publications, and a group's `type` are keys under `metadata`. The API validates them
on write in `api/src/services/profiles/validate.js`.

- **A profile carries no picture.** Text is what a profile is for, and an uploaded image costs
  a byte store, a public byte route, and a size limit that fails at the worst moment. A group
  or a collection is marked by the icon for its kind, drawn by `ProfileAvatar.vue`.
- **The mark is an icon, never initials.** `UserAvatar` draws monograms for people, so a
  lettered square beside a group name reads as a user.
- **The citation is generated when `metadata.citation` is null.** `resolveCitation` follows
  DataCite's order: creator, year, title, publisher, identifier. It is a display field, so an
  approximation is the right answer.
- **A publication is a DOI with optional decoration.** The title, container, and year are what
  an admin typed. Nothing resolves the DOI, and the link always goes through `doi.org`.
- **`profile_visibility` defaults to `PRIVATE`.** Going public is always a deliberate act.
- **`metadata.type` is a group's own word for what it is**, such as `lab` or `core`. It is
  stored lower case and rendered under the name on every card, and `GroupIcon` reads it to pick
  an icon and a colour. A collection has none; nothing renders one, so `buildProfileUpdate`
  reads the key only for a group.
- **`type` is not an enum.** `GROUP_TYPES` lists the four the icon map knows — `lab`, `project`,
  `center`, `core` — and the edit form offers those as a click beside a free text box. A word
  that is not on the list is stored as typed and wears the default icon. An institute is not a
  lab, and refusing its own name to keep a closed list would be the wrong trade. What is
  enforced is shape: letters, digits, spaces, and hyphens, at most 32 characters, because the
  value is rendered on a public profile and belongs to a label rather than to markup.

Profile editing reuses `edit_metadata`. A separate `edit_profile` action would carry the same
policy and give a reader two things to keep in step.

## What each audience sees

`view_profile` returns the union of three attribute tiers. They are defined in
`api/src/authorization/builtin/policies/group.js` and `collection.js`.

| Tier | Who | Gets |
|---|---|---|
| Full | Admin or oversight admin of the resource | Every attribute |
| Member | Group member, or holder of `COLLECTION:VIEW_METADATA` | `PUBLIC_ATTRIBUTES` plus `PROFILE_ATTRIBUTES`; for a group also admin contacts and ancestors |
| Profile | Any viewer the visibility admits, including an anonymous one | `PUBLIC_PROFILE_ATTRIBUTES`; for a group also admin names |

`view_profile` admits a caller through membership, oversight, a grant, or the column.
`isProfilePublic` admits anyone to a `PUBLIC` profile. `isProfileVisibleToSignedInUser` admits
any signed-in caller to an `AUTHENTICATED` one. The action is `reading`, so an archived group
keeps serving its profile.

Three things are absent from the profile tier on purpose.

**No counts.** A member count describes people who did not choose to be counted in public. A
dataset count tells an outsider how large a holding is. A public collection profile says its
datasets are not listed and gives no number.

**No personal email addresses.** `admins[*].email` stops at the member tier. A group that wants
to be reachable publishes a shared inbox as a `contact_email` link.

**No ancestry.** `ancestors[*]` describes the group hierarchy, which is internal structure.

## The public router

`api/src/routes/public.js` is mounted at `/public` before `authenticate` in
`api/src/routes/index.js`. It holds the only routes reachable without a token.
`api/tests/authorization/public_router.test.js` asserts the first two properties below.

- **Every route is a GET.**
- **Every route authorizes `view_profile`.**
- **A refusal is a 404, not a 403.** A 403 on a private group confirms the group exists.
  `hideRefusals` answers a private profile and an unknown id the same way.
- **The URL carries the id, not the slug.** `group.slug` changes on rename, which would break a
  published citation.

`optionalAuthenticate` gives an unauthenticated request `ANONYMOUS_PRINCIPAL`. The reasoning
for that is in [Decisions](./decisions.md). The router carries a rate limit and a five-minute
`Cache-Control`, and each constant's comment states its reason. Public profile reads are not
audited: an anonymous row names no actor, and the volume is unbounded.

## The UI

The authenticated Overview tab and the public pages share the components in
`ui/src/components/v2/profiles/`, so the two cannot drift. The Overview tab keeps its summary
band and wide and thin panels, described in
[UI Information Architecture](./ui-information-architecture.md#the-overview-tab). The
profile renders inside those panels.

The public pages live in `ui/src/pages/public/` and use `ui/src/layouts/public.vue`. They call
the API through `ui/src/services/v2/publicProfiles.js`, a bare axios instance. The shared client
redirects to logout on a 401, which would eject the readers these pages are for.

**Markdown renders with `html: false`, then DOMPurify.** `ProfileAboutBody.vue` drops raw HTML,
because this text reaches the widest audience the system has. The same component renders the
edit preview, so the preview cannot disagree with the page.

## What this does not do

- **No public listing or search.** A public profile is reachable by its URL only.
- **No public dataset pages.** Datasets carry file paths and consent codes, and need their own
  analysis.
- **No user profiles.** Only groups and collections have them.
- **No custom theming.** A profile gets text, not pictures, colours, or a footer.

## Not built

**The "visible to you" strip.** A signed-in viewer of a collection profile should see a count
such as `8 of 20 visible to you`, and an anonymous viewer sees none. The anonymous half is
built. For a caller with only `COLLECTION:VIEW_METADATA`, the strip needs a total they cannot
otherwise see, which is a disclosure worth its own change. It is tracked in
`.todo/issues/02-profiles.md` under T4.
