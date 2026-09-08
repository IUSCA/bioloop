---
title: V2 Visual Language Gaps
order: 8
---

# V2 Visual Language Gaps

This page lists the places where the v2 UI does not do what its code appears to say, and
what the smallest correcting change is for each. It is the gap between
[V2 Visual Language](./v2-visual-language.md), which describes what is built, and
[V2 Design System](./v2-design-system.md), which describes what to build toward.

Findings marked **verified** were reproduced in a running instance on 2026-09-07 by
reading computed styles rather than source. Findings marked **static** come from reading
the code and have not been reproduced on screen.

Items are ordered by what a user loses, not by effort.

Tiers 1, 2, and 3 were applied on 2026-09-08. Each item below keeps its original finding
as the evidence record and ends with a **Shipped** line saying what changed. Tier 4 is
still open.

## Tier 1 — Users see something wrong today

### 1. `ModernAlert` discards the body of every message it is given

**Verified.** `ModernAlert.vue` renders its default slot inside
`<div v-if="props.description">`. No call site passes `description`. Every one of the
seven alerts in the codebase therefore renders its title and nothing else.

Two of the seven pass no title either. `ReviewRequestModal.vue:74` and
`RequestAccessForm.vue:91` supply the heading through `<template #title>`, and
`ModernAlert` declares no such slot. Those two render an empty colored strip.

On the Create Subgroup form the two governance callouts render as the bare strings
"Membership propagation" and "Oversight visibility". The paragraphs explaining that
subgroup members become implicit members of every ancestor, and that ancestor admins gain
oversight, never reach the screen. Those are exactly the consequences the
[groups design record](/design/groups/design) expects the form to state before someone
creates a subgroup.

`CollectionCreateModal.vue:121` passes neither title nor description, so it renders an
empty amber strip.

**Minimal fix.** Render the default slot unconditionally, and fall back to `description`
only when no slot content is passed. One file, roughly four lines. Then add `title` and
`actions` slots, or change the two call sites to pass `title` as a prop.

**Does not change.** Colors, spacing, or any other call site's markup.

**Shipped.** `ModernAlert.vue` was rewritten. The default slot renders whenever it or
`description` has content, and `title` and `actions` slots were added. Measured on the
Create Subgroup form, the two governance callouts now render 269 and 144 characters where
they previously rendered 22 and 20.

### 2. `ModernAlert` renders errors in success green

**Verified.** `classMap` in `ModernAlert.vue` defines `slate`, `emerald`, `indigo`,
`rose`, and `amber`. The fallback is `emerald`. Three call sites pass a color outside
that set: `color="danger"` twice, both on conflict and error alerts, and `color="blue"`
once.

The rendered class on the Create Subgroup oversight callout is
`bg-emerald-50 dark:bg-emerald-900/20`. A user reading it sees a green success box where
the code says danger or information.

**Minimal fix.** Add `danger` and `blue` keys to `classMap` as aliases of `rose` and a
new blue entry, and add a `validator` to the `color` prop so an unknown value fails loudly
in development instead of silently going green. One file.

**Does not change.** The five existing color names or any call site.

**Shipped.** Wider than the minimal fix. The `color` prop now takes a meaning —  `info`,
`success`, `warning`, `danger`, or `neutral` — with a `validator` that refuses anything
else, and all seven call sites were migrated. This follows
[V2 design system](./v2-design-system.md#do-not-name-a-raw-hue-at-a-call-site) rather than
aliasing hue names, and it removes the fallback that produced the green error box. The
oversight callout on Create Subgroup measures `rgb(239, 246, 255)`, which is `blue-50`.

One deliberate color change came with it. The Authority Boundary callout in
`CollectionCreateModal.vue` was emerald and is now `info` blue, because it explains a
constraint rather than reporting a success.

### 3. `ModernAlert` borders never render

**Verified.** The `background` entry of each `classMap` color sets `border-{hue}-200` and
`dark:border-{hue}-800`, but the container never receives `border` or `border-solid`.
Computed `border-top-width` is `0px`. Tailwind's preflight sets `border-style: none`, and
[UI coding standards](./ui-coding-standards.md#use-tailwind-css-over-custom-styles)
already records that trap.

**Minimal fix.** Add `border border-solid` to the container class. One line. Decide first
whether the alert is meant to have a border at all; if not, delete the border color
classes instead, which is equally minimal and removes the misleading code.

**Shipped.** The border was kept. The container carries `border border-solid`, and
computed `border-top-width` is now `1px` with the tone's own color.

### 4. The `ActionButton` hover accent has never worked

**Verified.** `ActionButton.vue` builds its overlay class by interpolation:
`from-${props.hoverTheme}-500/0`. Tailwind scans source text for complete class names, so
`from-blue-500/0` is never generated. The class string reaches the DOM, and a scan of
`document.styleSheets` finds no rule matching it.

The overlay still paints, because `bg-gradient-to-r` reads the `--tw-gradient-*` custom
properties still set by the parent's `from-white via-gray-50 to-gray-50`. Its computed
`background-image` is `linear-gradient(to right, rgb(255,255,255), rgb(249,250,251),
rgb(249,250,251))`. Hovering fades in a five-percent white wash on every card, whatever
`hover-theme` says.

The stops are all `/0` in any case, so even a generated class would be fully transparent.

**Minimal fix.** Delete the overlay `<div>` and the `overlayGradient` computed property.
The border and shadow hover states in the same component are real and already give the
affordance. One file, about eight lines removed.

**Does not change.** How any action button looks, because the overlay is invisible.

**Shipped.** The overlay `<div>` and the `overlayGradient` computed property are gone. The
four action buttons on the dataset overview now hold two child elements rather than three,
and all six remaining hover classes resolve to real generated rules.

### 5. The collection detail page renders the archived chip twice

**Static.** `pages/v2/collections/[id]/index.vue` contains two `ModernChip` blocks with
the same `v-if="collection.is_archived"` and the same content, one inside the title group
and one in a sibling `div` under a comment reading `archived badge`.

**Minimal fix.** Delete the second block. Match the group detail page, which keeps the
chip beside the name.

**Shipped.** The second block is deleted. This one is confirmed by diff only: the
development database holds no archived collection, so the chip could not be brought on
screen.

### 6. `ResourceRoleBadge` ignores its own `size` prop for the icon

**Static.** The component's `size` prop takes `sm`, `base`, or `lg`, and `sizeClasses`
switches on those. `iconSize` in the same file switches on `small`, `medium`, and
`large`, so no call site can ever match, and every icon falls through to the default.

`GroupMemberRoleBadge.vue` is the same component with the other vocabulary: its `size`
prop takes `small`, `medium`, and `large` throughout.

**Minimal fix.** Change `iconSize` in `ResourceRoleBadge.vue` to switch on `sm`, `base`,
and `lg`. One file. Unifying the two vocabularies is Tier 3 below.

**Shipped.** Folded into item 14 rather than patched separately, because the merged
component has one size vocabulary and the bug cannot survive it.

## Tier 2 — The accessibility floor

### 7. The groups browse page cannot be used from a keyboard

**Verified.** `GroupCard.vue` is a `VaCard` carrying `cursor-pointer` and
`@click="router.push(...)"`, which renders a `<div>`. On the browse page all 11 cards are
non-focusable, none has a `role` or `tabindex`, and none contains a focusable child. The
accessibility tree exposes each group name as a heading, not a link. `<main>` holds nine
focusable elements and not one of them reaches a group.

The cards are also not real links, so middle-click, open-in-new-tab, and copy-link-address
do nothing.

**Minimal fix.** Wrap the card content in a `<RouterLink>` and drop the click handler.
This restores keyboard focus, the browser's own focus ring, and link semantics in one
change. One file.

**Does not change.** The card's appearance, provided the link is set to `display: block`
and inherits color.

**Shipped.** `VaCard` has a `to` prop, so the click handler became `:to` and no wrapper was
needed. All 11 cards on the browse page now render as `<a>` elements with an `href`, and
`<main>` holds 20 focusable elements rather than nine. A scoped rule keeps the global
anchor color and hover underline off the card, and the card carries `.focus-ring`.

### 8. `va-text-secondary` is below AA in both themes

**Verified.** Vuestic's `--va-secondary` is `rgb(118, 124, 136)` and the dark preset in
`ui/vuestic.config.js` does not override it. It carries field labels, section headings
such as `QUICK ACTIONS`, and helper text across 49 places in v2.

| Surface | Ratio | Needs |
|---|---|---|
| `#F4F6F8` page ground | 3.87 | 4.5 |
| White card | 4.19 | 4.5 |
| `#1f2937` dark card | 3.50 | 4.5 |

**Minimal fix.** Set `secondary` in both presets in `ui/vuestic.config.js`. A light value
of `#5A6070` measures 6.28:1 on white and 5.80:1 on the page ground. For dark, `gray-400`
(`#9ca3af`) measures 5.78:1 on `#1f2937` and is already in the palette. One file, two
lines, and every one of the 49 call sites improves without being touched.

Note that `gray-500` is not a safe light value here. It measures 4.83:1 on white but
4.46:1 on the `#F4F6F8` page ground, which is where most of these labels sit.

**Does not change.** Any component's markup.

**Shipped.** As proposed. `--va-secondary` is `#5A6070` in light and `#9ca3af` in dark.
Measured in the running app, it reaches 6.28:1 on a white card, 5.80:1 on the page ground,
and 5.78:1 on a `#1f2937` dark card.

### 9. Group card metadata is at 2.56:1

**Verified.** `GroupCard.vue` sets `text-slate-400` on the group type, the member count,
and the hierarchy label. On the white card that is 2.56:1, the worst ratio measured
anywhere in v2. It affects the primary metadata of every card on the main Groups page.

**Minimal fix.** Move those lines to `text-slate-600 dark:text-slate-400`, which measures
7.58:1 on white. One file, six occurrences of `text-slate-400`.

**Shipped.** Five occurrences, not six; the sixth was `text-slate-300` on the decorative
arrow and was left alone. Card metadata now measures 7.58:1 in light and 5.72:1 in dark.

### 10. Icon-only buttons are unlabelled

**Static.** v2 contains 23 hand-rolled `<button>` elements and 9 `aria-label`
attributes. `focus-visible` styling appears in two files; no v2 file defines a `focus:`
ring. Vuestic's own controls carry both, so the gap is confined to the hand-rolled set.

**Minimal fix.** Add `aria-label` to the icon-only buttons, and add one shared
`focus-visible` utility class to `ui/src/styles/main.css` for hand-rolled controls to
apply. Doing this per component as each is next edited is reasonable; a single sweep is
about a dozen files.

**Shipped.** Smaller than estimated. `.focus-ring` is defined once in
`ui/src/styles/main.css`. Auditing the 23 buttons found three genuinely icon-only and
unlabelled, in `UserChip.vue`, `GroupChip.vue`, and `AutoCompleteSearch.vue`; each now
names what it removes. `ModernCollapsible.vue` looked unlabelled to a text scan but
carries `aria-expanded` and a header slot, so it was left alone.

## Tier 3 — Duplication that is cheap to remove

### 11. `.tab-count-badge` is copied into four files

**Static.** The three detail pages and the access requests page each carry an identical
16-line scoped block with hardcoded `rgb()` values.
[V2 page patterns](./v2-page-patterns.md) currently instructs the reader to copy it.

**Minimal fix.** Move the rule to `ui/src/styles/main.css` under `@layer components`,
delete the four scoped blocks, and update the sentence in
[V2 page patterns](./v2-page-patterns.md). Six files, all deletions but one.

**Shipped.** As proposed. Verified on the group detail, collection detail, dataset detail,
and access requests pages, in both themes.

### 12. Vuestic density overrides are copied into thirteen files

**Static.** `--va-data-table-cell-padding: 8px` appears in seven files and
`.card.header { --va-card-padding: 0.8rem }` in six. They express one decision: v2 tables
and card headers are denser than the Vuestic default.

**Minimal fix.** Set both variables once in `ui/src/styles/overrides.css`, scoped to a
single `.v2-dense` class that pages opt into, or globally if the density is wanted
everywhere. Then delete the thirteen local blocks.

**Shipped.** The two variables were split rather than treated as one decision. The card
header selector `.card.header` is already identical everywhere, so that rule moved to
`ui/src/styles/overrides.css` unchanged and seven local blocks went away with no template
edit. The table selector differed per file, so the eight v2 tables now carry a shared
`.v2-table` class instead of `.datasets-table` and its siblings.

Six v1 files still set `--va-data-table-cell-padding` locally and were left alone. Four of
them use a different value, so they are not copies of one decision.

`GroupSubgroupsTab.vue` has a data table that never carried the override and still does
not. Making it match its sibling tabs is a visual change nobody asked for, so it is left
for whoever next edits that file.

### 13. `ReviewRequestModal.vue` redefines the global transitions

**Static.** The file carries its own `fade-slide` and `list` keyframes. Both are already
defined in `ui/src/styles/main.css`, with different timings, so the same named transition
behaves differently in this one modal.

**Minimal fix.** Delete the local block. One file.

**Shipped.** As proposed. The modal now uses the global `fade-slide` timing.

### 14. Two role badges are the same component twice

**Static.** `GroupMemberRoleBadge.vue` and `ResourceRoleBadge.vue` share their markup,
their tinted-transparent recipe, and four of their six roles. They differ in the role sets
they cover, in their `size` vocabulary, and in one shade: `OVERSIGHT` is
`text-emerald-600` in one and `text-emerald-700` in the other.

**Minimal fix.** Keep one component with the union of both role maps and one size
vocabulary, and re-export the other name until call sites are migrated. Two files plus a
find-and-replace.

**Shipped.** No re-export was needed, because there were only six call sites. Both files
are replaced by `components/v2/RoleBadge.vue`, which carries all six roles, the `sm`,
`base`, `lg` vocabulary from [V2 design system](./v2-design-system.md#the-primitive-set),
and a `validator` on `size`. `OVERSIGHT` settled on `text-emerald-700`, and every role now
uses the `bg-{hue}-500/10` tint the design system states.

The fallback tone stayed on `slate` rather than moving to `gray`. That is the Tier 4 ramp
decision and it should be taken once, for the whole tree.

## Tier 4 — Convergence, worth planning rather than patching

These are the items where the minimal change is not obviously the right change. Each is
argued in [V2 Design System](./v2-design-system.md).

- **Two neutral ramps.** 62 files are gray-dominant and 46 slate-dominant, with six
  mixing both. The slate side is mostly the audit subsystem and the dashboard, so
  converging is a mechanical rename across a contiguous part of the tree rather than a
  scattered one.
- **Three badge recipes.** Tinted-transparent, solid-tint, and gradient variants appear
  next to each other on the same header.
- **Two card languages.** `VaCard` at 6px with no border, hand-rolled panels at 8px with
  a border, side by side in one column.
- **Four page shells.** The five top-level pages differ in width, title treatment,
  loading strategy, and filter control.
- **Ten heading recipes.** 26 `<h2>` elements across ten class combinations spanning
  `text-sm` to `text-xl`.

## What is left

Tier 4 is open, and each of its five items needs a decision before any code moves.

Two contrast failures found on 2026-09-07 are also still open, because neither has a fix
that stops at a shade. `--va-primary` on the dark page ground measures 4.49:1, one
hundredth below the floor, and changing it moves every link, active tab, and focus ring in
both themes. Avatar initials measure 3.40:1 against a generated background, which needs
the generator to pick from a fixed, checked palette rather than from a hash.
