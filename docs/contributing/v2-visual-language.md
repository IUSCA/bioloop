---
title: V2 Visual Language
order: 6
---

# V2 Visual Language

This page describes the visual style the `v2` UI actually uses today. It makes no
judgement about whether that style is right. For the rules new work should follow, see
[V2 Design System](./v2-design-system.md). For the list of places where the code and the
intended style disagree, see [V2 Visual Language Gaps](./v2-visual-language-gaps.md).

The scope is the groups, collections, datasets, grants, access requests, audit, and
dashboard screens described in the [groups design record](/design/groups/). Those live in
`ui/src/pages/v2/` and `ui/src/components/v2/`, plus a small shared layer in
`ui/src/components/utils/`.

::: info Snapshot
Class counts were measured on 2026-09-07 across the 128 `.vue` files under
`ui/src/pages/v2/` and `ui/src/components/v2/`, totalling 16,924 lines. Rendered values
— computed colors, contrast ratios, and radii — were read from a running instance on the
same date at a 1440x900 viewport, in both themes. The
[Measuring this again](#measuring-this-again) section gives both sets of commands.
Re-run them before relying on a number.
:::

## How v2 departs from the house style

The rest of the UI follows [UI coding standards](./ui-coding-standards.md): reach for a
Vuestic component first, and use the Vuestic `color` vocabulary. The v2 screens keep that
rule for structure and break it for surface.

Three departures define the v2 look.

**Vuestic supplies structure, Tailwind supplies surface.** Vuestic still provides the
page chrome. `VaCard` appears 45 times, `VaButton` 65, `VaModal` 18, `VaTabs`/`VaTab` 26,
`VaDataTable` 10, `VaSkeleton` 22, and `VaInnerLoading` 25. Everything inside those
containers is hand-built from Tailwind utilities. Badges, chips, alerts, provenance
boxes, grant rows, and stat tiles are all custom markup.

**Colors come from the Tailwind palette, not the Vuestic preset.** `ui/vuestic.config.js`
loads every Tailwind hue as a Vuestic color variable, so `color="blue"` and
`color="amber"` are legal Vuestic props alongside `color="primary"` and `color="danger"`.
The v2 screens use both vocabularies. Tailwind hue classes are the dominant form.

**A `Modern*` component family sits between Vuestic and the pages.** Five components in
`ui/src/components/utils/` carry the custom visual language, and all 54 of their call
sites are inside v2.

| Component | Call sites | What it renders |
|---|---|---|
| `ModernChip` | 21 | Gradient status pill with border |
| `ModernCard` | 15 | Bordered panel with an uppercase title bar |
| `ModernButtonToggle` | 10 | Segmented filter control |
| `ModernAlert` | 7 | Tinted inline message box |
| `ModernCollapsible` | 1 | Disclosure section |

## Color

### Two neutral ramps, split by feature area

The v2 code uses `gray` and `slate` for the same jobs. The split follows feature area
rather than date.

| Area | Ramp | Files |
|---|---|---|
| Audit log templates, tokens, and page | `slate` | 35 |
| Dashboard (`home.vue`, `components/v2/dashboard/`) | `slate` | 5 |
| Shared v2 chips and badges | `slate` | 3 |
| Groups, collections, datasets, grants, access requests | `gray` | 62 |
| Same areas, slate-dominant exceptions | `slate` | 3 |

Counting a file by whichever ramp it uses more, 62 are gray-dominant and 46 are
slate-dominant. Six files mix both: `DatasetSearchSelect.vue`, `GroupMembersTab.vue`,
`AddGroupMemberModal.vue`, and the three per-resource audit tabs. The audit tabs mix
because they embed slate audit templates in a gray page.

Across all v2 files, `gray` classes outnumber `slate` classes 613 to 250. The two ramps
differ enough to be visible when a slate audit row sits inside a gray card, because
`slate` is cooler than `gray` at every step.

### Hues and what they mean

Nine hues carry meaning in v2. Six more appear fewer than fifteen times each.

| Hue | Uses | Current meaning |
|---|---|---|
| `blue` | 160 | Primary action, links, selection, tab underline, user and group chips |
| `red` | 129 | Destructive action, revoke, reject, expiring grant, required-field marker |
| `amber` | 104 | Group admin role, warnings, oversight banner, caution alerts |
| `emerald` | 86 | Oversight role, success alerts, "add" actions |
| `green` | 50 | Approve button, success metric tiles |
| `rose` | 44 | `core` group type, `ModernChip` accent, alert variant |
| `sky` | 29 | Group member role, info metric tiles |
| `violet` | 12 | Grant holder role, `project` group type |
| `indigo` | 10 | Transitive member role, `ModernChip` primary gradient |

Green and emerald both mean success. Red and rose both mean danger. Blue, sky, and
indigo all appear in the primary and informational range.

### Semantics that are stable

Four mappings hold everywhere they appear.

- **Role color.** `PLATFORM_ADMIN` is red, `ADMIN` is amber, `MEMBER` is sky,
  `TRANSITIVE_MEMBER` is indigo, `OVERSIGHT` is emerald, and `GRANT_HOLDER` is violet.
  Both `GroupMemberRoleBadge.vue` and `ResourceRoleBadge.vue` implement this.
- **Group type color.** `GroupIcon.vue` maps `lab` to teal, `project` to violet, `center`
  to orange, `core` to rose, and everything else to blue.
- **Revoked grant.** `GrantRow.vue` applies `opacity-60` to the row and `line-through` to
  the access type name.
- **Expiring grant.** `GrantRow.vue` switches the expiry line to red at fourteen days or
  fewer.

### Three badge recipes

A small colored label is written three different ways.

**Tinted-transparent**, in `GroupMemberRoleBadge.vue` and `ResourceRoleBadge.vue`:

```
text-{hue}-700 bg-{hue}-500/10 dark:text-{hue}-400 dark:bg-{hue}-400/10
text-[11px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide
```

**Solid-tint**, written inline in `GrantRow.vue` and repeated in several tabs:

```
bg-{hue}-100 text-{hue}-800 dark:bg-{hue}-900/40 dark:text-{hue}-300
text-xs font-medium px-2 py-0.5 rounded-sm
```

**Gradient**, in `ModernChip.vue`:

```
bg-gradient-to-r from-{hue}-100 to-{hue2}-100 text-{hue}-800 border-{hue}-200 …
px-2.5 py-0.5 rounded-md text-xs font-medium border border-solid
```

The three recipes differ in radius, in padding, in weight, and in whether they carry a
border. They appear next to each other on the group and collection detail headers.

### The Vuestic color bridge

`ui/vuestic.config.js` defines every Tailwind shade as a Vuestic color variable and then
sets a light and dark preset. The preset values are not Tailwind values:
`success` is `#228200`, `info` is `#158DE3`, `danger` is `#E42222`, and `warning` is
`#FFD43A`.

Two consequences follow. A `VaButton color="success"` is a different green from a
`bg-green-600` button next to it. And `color="blue"` on a Vuestic component resolves to
`#3b82f6`, which is Tailwind's `blue-500` rather than the preset primary.

Attributed `color` props inside v2 split across both vocabularies. Vuestic semantic names
account for 25 uses. Tailwind hue names account for 10, all on `ModernButtonToggle` and
`ModernAlert`.

### Icon color through CSS variables

Header and label icons take their color from an inline style rather than a class.
`style="color: var(--va-secondary)"` appears 20 times and
`style="color: var(--va-primary)"` 13 times. The Vuestic utility class
`va-text-secondary` appears 49 times for the same purpose.

## Typography

The scale is narrow and consistent.

| Class | Uses | Where |
|---|---|---|
| `text-sm` | 316 | Body text, table cells, labels |
| `text-xs` | 157 | Captions, tags, helper text |
| `text-base` | 36 | Emphasised body |
| `text-xl` | 24 | Page title on detail pages |
| `text-2xl` | 21 | Metric values, header icons |
| `text-lg` | 20 | Section headings |
| `text-3xl` / `text-4xl` | 7 | Dashboard hero title only |

Only two weights carry the design: `font-medium` at 130 uses and `font-semibold` at 114.
`font-normal` appears 4 times and `font-mono` 7.

Heading elements are less settled. Six `<h1>`, 26 `<h2>`, and 18 `<h3>` elements appear
across v2. The four detail pages all use `<h1 class="text-xl font-semibold">`. The
dashboard uses `text-3xl sm:text-4xl`. The `<h2>` elements use ten distinct class
combinations across `text-sm`, `text-lg`, and `text-xl`.

The global stylesheet sets `h1 { font-size: 3.2em }` in `ui/src/styles/main.css`. Every
v2 heading overrides it with a utility class.

## Radius, border, and elevation

`rounded-lg` is the default container radius at 56 uses. `rounded-full` at 39 uses is for
avatars, pills, and the tab count badge. `rounded-md` at 16, bare `rounded` at 20,
`rounded-xl` at 15, `rounded-sm` at 7, and `rounded-2xl` at 5 fill in the rest. One
component uses the arbitrary value `rounded-[10px]`.

Two radii run side by side, because Vuestic and Tailwind disagree. A `VaCard` computes
to a `6px` radius from `--va-card-border-radius`. Every hand-rolled panel uses
`rounded-lg`, which is `8px`. On the group overview page the four stat cards and the
admins card render at 6px while the quick-action buttons beside them render at 8px.

Borders are hairline and neutral. `border-gray-200` with `dark:border-gray-700` is the
standard pair. Most borders carry `border-solid`, which Tailwind's preflight requires.
The same page shows the other half of that split: `VaCard` paints no border at all and
separates by background alone, while the custom action buttons carry a 1px
`rgb(55, 65, 81)` border and a `#111827` to `#1f2937` gradient.

Elevation is nearly flat. `shadow-sm` appears 9 times, `shadow-md` 5, `shadow-xl` 3, and
bare `shadow` once. Depth comes from borders and background tints instead. Dark mode
would otherwise show a white glow, which `ui/src/styles/overrides.css` corrects by
setting `--va-shadow` to a dark value.

## Spacing

The rhythm is tight and built on a 4px step.

`gap-3` at 122 uses and `gap-2` at 99 dominate. `gap-4` follows at 68 and `gap-1` at 53.
Half steps appear where a control needs to be smaller: `gap-1.5` 27 times, `py-2.5` 26,
and `py-0.5` 20.

Card padding is `px-6` for page-level content and `p-4` inside panels. Vuestic card
padding is narrowed locally to `0.8rem` through a `--va-card-padding` override.

Empty and error blocks use `py-12` at 43 uses, which is the tallest vertical rhythm in
the codebase.

## Icons

Two icon systems run side by side, as the house standard allows.

Iconify MDI is the default. It appears as `<i-mdi-name />` for a fixed icon and
`<Icon :icon="…" />` where the name is computed. Vuestic's own Material Icons appear only
through component props such as `<VaButton icon="add">`.

Icon meaning is consistent for roles. `mdi-crown-outline` marks a platform admin,
`mdi-shield-crown-outline` a group admin, `mdi-eye-outline` oversight, and
`mdi-certificate-outline` a grant holder. Group types use `mdi-flask`,
`mdi-folder-multiple`, `mdi-domain`, and `mdi-microscope`.

Page headers are less consistent. The group detail page hardcodes `<i-mdi-account-group>`
while the dataset and collection pages read `constants.icons` through `<Icon>`.

## Page shells

The five top-level v2 pages use four different shells.

| Page | Width | Title | Loading | Filters | Body |
|---|---|---|---|---|---|
| `groups/index.vue` | full | none | `VaSkeleton` | `VaChip` | `GroupCard` grid |
| `collections/index.vue` | `max-w-7xl` | none | `VaInnerLoading` | `ModernButtonToggle` | `VaDataTable` |
| `datasets/index.vue` | `max-w-7xl` | none | `VaInnerLoading` | `ModernButtonToggle` | `VaDataTable` |
| `access-requests/index.vue` | full | `<h1>` | none | `VaTabs` | card list |
| `home.vue` | `max-w-7xl` | `DashboardHero` | `VaSkeleton` | none | sections |

The layout at `ui/src/layouts/default.vue` sets no maximum width, so the `max-w-7xl`
choice is per page.

The three detail pages agree closely. Each opens with a `<Transition name="fade-slide"
mode="out-in">` wrapping a skeleton state, an `ErrorState`, and the loaded content. Each
renders a header row, then `<VaTabs class="border-b border-solid border-blue-500/50">`,
then one panel gated by `v-if="activeTab === '…'"`. This is the shape that
[V2 page patterns](./v2-page-patterns.md) documents.

Archived status is shown three ways. The group and collection pages render a
`ModernChip color="accent"`. The dataset page renders a `VaAlert color="warning"` for
deletion. The list pages rely on a status filter instead of a per-row mark.

## Dark mode

Dark mode support is close to complete. Of 1,533 color utility occurrences, 723 are
`dark:` variants. Only 23 lines set a light color with no `dark:` variant on the same
line, and most of those are `-500` mid-tones that read acceptably on both grounds.

Two conventions carry the dark palette. Backgrounds step from `bg-white` or `bg-gray-50`
to `dark:bg-gray-800` or `dark:bg-gray-900`. Tinted panels step from `bg-{hue}-50` to
`dark:bg-{hue}-900/20`, using opacity rather than a darker shade.

Vuestic's dark theme is corrected in `ui/src/styles/overrides.css` for shadows, list item
labels, and input borders.

One Vuestic variable is not corrected. `--va-secondary` resolves to `rgb(118, 124, 136)`
in both themes, and the `va-text-secondary` class that carries it appears 49 times in v2.
Measured against the surfaces it actually sits on, it reaches 4.19:1 on a white card,
3.87:1 on the `#F4F6F8` page ground, and 3.50:1 on a `#1f2937` dark card.

## Interaction

Hover is the main affordance. `hover:underline` appears 16 times on links. Cards and
action buttons raise a border color and add `hover:-translate-y-0.5` with
`hover:shadow-md`. Transition classes appear 30 times, split between `transition-all`,
bare `transition`, and `transition-colors`.

Focus is thinner. `focus-visible` appears 6 times, all in `ModernButtonToggle.vue` and
`DatasetDownloadModalV2.vue`. No v2 file uses a `focus:` ring. Vuestic components carry
their own focus styling, so the gap is limited to the 23 hand-rolled `<button>` elements.

Of those 23 buttons, 9 carry an `aria-label`.

Card navigation is click-only. `GroupCard.vue` is a `VaCard` with
`@click="router.push(...)"`, so it renders as a `<div>`. On the groups browse page all 11
result cards are non-focusable, carry no `role`, and contain no focusable child. The
accessibility tree lists the group names as headings rather than links. Nine focusable
elements exist in `<main>` on that page, and none of them is a group.

Responsive prefixes are sparse. `lg:` appears 11 times, `md:` 9, and `sm:` 8, mostly on
the dashboard grid and a few header rows. The layout survives the narrowing anyway. At a
500px viewport the group detail page produces no horizontal overflow, the two-column
grid stacks, and `VaTabs` scrolls its own strip behind arrows.

### Measured contrast

Ratios below are computed against the resolved background, blending every translucent
layer, and compared to the WCAG AA floor for the text's own size and weight.

| Text | Color | On | Ratio | Needs |
|---|---|---|---|---|
| Group card type, member count, hierarchy label | `text-slate-400` | white card | 2.56 | 4.5 |
| Field labels, section headings, helper text | `va-text-secondary` | page ground | 3.87 | 4.5 |
| Same, on a card | `va-text-secondary` | white card | 4.19 | 4.5 |
| Same, dark theme | `va-text-secondary` | `#1f2937` card | 3.50 | 4.5 |
| Active tab, links, breadcrumbs (dark theme) | `--va-primary` | `#060c17` ground | 4.49 | 4.5 |
| Avatar initials | white | generated avatar color | 3.40 | 4.5 |

Vuestic buttons report a false failure under this method, because they paint their fill
on a child element rather than the element carrying the label. Those rows are excluded.

## Local CSS

Eighteen v2 files carry a `<style>` block. Four kinds of rule appear.

**`.tab-count-badge`** is defined identically in four files: the three detail pages and
the access requests page. It is 16 lines of plain CSS with hardcoded `rgb()` values.
[V2 page patterns](./v2-page-patterns.md) tells the reader to copy it.

**`--va-data-table-cell-padding: 8px`** narrows Vuestic table rows in seven files.

**`.card.header { --va-card-padding: 0.8rem }`** narrows Vuestic card padding in six
files.

**Component-local rules** cover the rest: an `@apply` block in
`DatasetDownloadModalV2.vue`, an input height override in `ExpirySelector.vue`, a switch
track shadow in `GroupAllowMemberContribSwitch.vue`, and a duplicate copy of the global
`fade-slide` and `list` transitions in `ReviewRequestModal.vue`.

## Measuring this again

Run these from `ui/src`. The first line builds the file list every other command reads.

```bash
find pages/v2 components/v2 -name '*.vue' -print0 > /tmp/v2files.z

# hue frequency
xargs -0 grep -ohE '\b(dark:)?(bg|text|border|ring|divide)-[a-z]+-[0-9]{2,3}\b' < /tmp/v2files.z \
  | sed -E 's/^dark://; s/^[a-z]+-//; s/-[0-9]+$//' | sort | uniq -c | sort -rn

# dark-mode coverage
xargs -0 grep -ohE '\bdark:(bg|text|border)-[a-z]+-[0-9]{2,3}\b' < /tmp/v2files.z | wc -l

# type, radius, spacing scales
xargs -0 grep -ohE '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl)\b' < /tmp/v2files.z | sort | uniq -c | sort -rn
xargs -0 grep -ohE '\brounded(-[a-z0-9]+)*\b'                 < /tmp/v2files.z | sort | uniq -c | sort -rn
xargs -0 grep -ohE '\bgap-[0-9.]+\b'                          < /tmp/v2files.z | sort | uniq -c | sort -rn

# which neutral ramp each file prefers (see below for the rendered-value recipe)
for f in $(find pages/v2 components/v2 -name '*.vue'); do
  s=$(grep -c -- '-slate-' "$f"); g=$(grep -c -- '-gray-' "$f")
  [ "$s" -gt "$g" ] && echo "SLATE $f" || { [ "$g" -gt 0 ] && echo "GRAY  $f"; }
done | sort
```

### Rendered values

Class counts describe the source. They do not describe what a user sees, because Vuestic
variables, translucent layers, and dynamically built class names all resolve at runtime.
Three of the findings above exist only at runtime.

Read them with a browser attached to a running instance. Walk every element that owns a
text node, resolve its background by blending translucent ancestors down to the body,
and compare the ratio to the WCAG floor for that font size and weight. Read
`getComputedStyle` for radius and border width rather than trusting the class list, and
check `document.styleSheets` for a rule before believing a class in the DOM does
anything.
