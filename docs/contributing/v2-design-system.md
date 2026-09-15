---
title: V2 Design System
order: 6
---

# V2 Design System

This page states the visual rules the `v2` UI follows: the groups, collections, datasets,
grants, access requests, audit, and dashboard screens described in the
[groups design record](/design/groups/). Those live in `ui/src/pages/v2/` and
`ui/src/components/v2/`, plus a small shared layer in `ui/src/components/utils/`.

[UI coding standards](./ui-coding-standards.md) governs everything below the visual
layer: Tailwind over custom CSS, the documentation block on every component, auto-imports,
and the shared services. [V2 page patterns](./v2-page-patterns.md) governs capability
gating, fetching, and tab structure. This page adds the visual decisions those two leave
open.

::: info Snapshot
Class counts were measured across the 128 `.vue` files under `ui/src/pages/v2/` and
`ui/src/components/v2/`, totalling 16,924 lines. Rendered values — computed colors,
contrast ratios, and radii — were read from a running instance at a 1440x900 viewport, in
both themes, on 2026-09-08. The [Measuring this again](#measuring-this-again) section
gives both sets of commands. Re-run them before relying on a number.
:::

## How v2 departs from the house style

The rest of the UI reaches for a Vuestic component first and uses the Vuestic `color`
vocabulary. The v2 screens keep that rule for structure and break it for surface.

**Vuestic supplies structure, Tailwind supplies surface.** Vuestic provides the page
chrome: `VaCard` appears 45 times, `VaButton` 65, `VaModal` 18, `VaTabs`/`VaTab` 26,
`VaDataTable` 10, `VaSkeleton` 22, and `VaInnerLoading` 25. Most of what sits inside those
containers is built from Tailwind utilities.

**Colors come from the Tailwind palette, not the Vuestic preset.** `ui/vuestic.config.js`
loads every Tailwind hue as a Vuestic color variable, so `color="blue"` is a legal Vuestic
prop alongside `color="primary"`. The preset values are not Tailwind values: `success` is
`#228200`, `info` is `#158DE3`, `danger` is `#E42222`, and `warning` is `#FFD43A`. A
`VaButton color="success"` is therefore a different green from a `bg-emerald-600` button
beside it.

**Density is tighter than stock.** `--va-data-table-cell-padding` and `--va-card-padding`
are both reduced. These screens carry more rows and more panels per page than the Vuestic
defaults assume.

## The layering rule

Three layers, and a component belongs to exactly one.

**Vuestic owns interactive chrome.** Buttons, inputs, selects, checkboxes, switches,
modals, tabs, data tables, pagination, and skeletons come from Vuestic. These carry focus
management, keyboard handling, and ARIA that a hand-rolled replacement will not.
Replacing one is a decision to re-implement accessibility, and it needs a reason written
down in the component's documentation block.

**A small primitive set owns repeated surface.** These are used often enough, and were
styled inconsistently enough, that they need to be components rather than copied class
strings. The set is defined below and should stay small.

**Tailwind owns layout and one-off surface.** Anything not in the two layers above is
utility classes written in place.

The failure mode to avoid is the fourth layer: a class string copied between files because
no component owns it. When a class string appears in a third file, it becomes a primitive
or a rule in `main.css`.

## Color

### One neutral palette: `gray`

A palette here means one of Tailwind's named color sets, such as `gray` or `slate`, each
running from shade 50 through shade 900.

Use `gray` for every neutral in new code. Do not use `slate`, `zinc`, `neutral`, or
`stone`.

This rule governs new work only. It does not oblige anyone to convert the 46 existing
slate-dominant files, and a change whose only purpose is to swap `slate` for `gray` is not
worth reviewing on its own. Convert a file when you are already editing it for another
reason, and convert the lines you are touching rather than the whole file.

`gray` is the tie-break for a reason that is not preference. Vuestic's dark preset in
`ui/vuestic.config.js` already sits on it: `backgroundSecondary` and
`backgroundCardPrimary` are both `#1f2937`, which is `gray-800` exactly. Every `VaCard` in
dark mode therefore paints `gray-800`, so `gray` needs no justification at a call site and
`slate` always sits slightly off the framework's own value.

The visible difference between the two is small. `slate-800` is `#1e293b` against
`gray-800` at `#1f2937`, a gap of 4 of 255 in the blue channel, and the mid-tones differ by
about 9. Converging is worth doing because it answers "which neutral do I use here", not
because the current mix looks broken. Across v2, `gray` classes outnumber `slate` 571 to
236.

### Semantic meaning is fixed

These mappings hold in the code and should not be re-decided per screen.

| Meaning | Hue | Where it applies |
|---|---|---|
| Primary action, link, selection | `blue` | Buttons, tab underline, focus ring |
| Destructive, revoked, rejected, expiring | `red` | Revoke, reject, danger zone, expiry warning |
| Caution, needs attention | `amber` | Warnings, oversight banner, group admin role |
| Success, approved, granted | `emerald` | Approve, success alerts, oversight role |
| Neutral, inactive, archived | `gray` | Archived chips, disabled state, system tags |

Six hues carry no general meaning and stay reserved for the identity they encode: `violet`
for grant holder and `project` groups, `sky` for member, `indigo` for transitive member,
and `teal`, `orange`, and `rose` for the `lab`, `center`, and `core` group types.

Two rules follow. Do not introduce `green` where `emerald` means success, and do not
introduce `rose` where `red` means danger. The difference carries no information.

### Do not name a raw hue at a call site

A component's `color` prop takes a meaning, not a hue. `color="danger"`, not
`color="rose"`. The hue is the primitive's business.

`Badge`, `ModernAlert`, and `ModernButtonToggle` all follow this rule. `Badge` names the
reserved identity tones alongside the meanings, so a caller cannot invent a hue.

Note that a control and a message use different words for blue: a `SegmentedToggle` takes
`primary`, because blue there means the selected segment, and an `Alert` takes `info`,
because blue there means information.

### Refuse an unknown color rather than falling back

A `color` prop takes a `validator` listing the values it accepts. An unrecognised value
fails loudly in development instead of resolving to whatever the fallback happens to be.
This follows the repository's standing rule that a missing entry in a lookup table is a
gap to report, not a value to guess.

A silent fallback is not a theoretical risk here. An earlier `ModernAlert` fell back to
emerald, so both of its error alerts rendered as green success boxes.

### Every color class has a dark variant

Write the pair together, on the same line, every time:
`text-gray-600 dark:text-gray-400`. Reviewers can then see a missing variant without
running anything. Coverage is good — 723 of 1,533 color utilities carry `dark:` — and the
rule keeps it that way.

Two conventions carry the dark palette. Solid surfaces step from `bg-white` or `bg-gray-50`
to `dark:bg-gray-800`. Tinted panels step from `bg-{hue}-50` to `dark:bg-{hue}-900/20`,
using opacity rather than a darker shade, so one rule covers every hue.

### Contrast is a floor, not a goal

Body text meets WCAG AA: 4.5:1 for normal text, 3:1 at 24px or at 18.66px bold. This holds
in both themes and against the surface the text actually sits on, not against white.

Two shades fail that floor on the surfaces v2 puts them on, and they must not be used for
light-mode text: `text-gray-400` at 2.54:1 on white and `text-slate-400` at 2.56:1. Use
`text-gray-600 dark:text-gray-400` for muted text instead, which measures 7.56:1 on white
and 5.78:1 on a `gray-800` card.

`text-gray-500` is the borderline case. It clears the floor on a white card at 4.83:1 and
misses it on the `#F4F6F8` page ground at 4.46:1, so it is safe inside a card and not
outside one. `text-gray-400` remains fine as a `dark:` value and as a decorative icon
color.

Ratios below are computed against the resolved background, blending every translucent
layer, and compared to the floor for the text's own size and weight.

| Text | On | Ratio | Needs |
|---|---|---|---|
| Group card metadata | white card | 7.58 | 4.5 |
| Group card metadata | `#1f2937` card | 5.72 | 4.5 |
| `va-text-secondary` | `#F4F6F8` page ground | 5.80 | 4.5 |
| `va-text-secondary` | white card | 6.28 | 4.5 |
| `va-text-secondary` | `#1f2937` card | 5.78 | 4.5 |
| Active tab, links, breadcrumbs (dark) | `#060c17` ground | 4.49 | 4.5 |
| Avatar initials | generated avatar color | 3.40 | 4.5 |

The last two rows are below the floor. Both are in [Still open](#still-open).

Vuestic buttons report a false failure under this method, because they paint their fill on
a child element rather than the element carrying the label. Those rows are excluded.

## The primitive set

Adding to this set needs an argument.

**`Badge`** is `components/v2/Badge.vue`, and it is the only badge. One recipe:
tinted-transparent, because it reads on both themes without a second color decision.

```
text-{hue}-700 bg-{hue}-500/10 dark:text-{hue}-400 dark:bg-{hue}-400/10
inline-flex items-center gap-1 rounded-md px-1.5 py-0.5
text-2xs font-semibold uppercase tracking-wide
```

It takes a meaning or a reserved identity tone, a size from `sm`, `base`, `lg`, and an
optional icon. It uppercases its label, and `:uppercase="false"` is the one documented
exception, for content that is a proper noun such as a group or preset name.

**`RoleBadge`** composes `Badge` and owns the role-to-tone, role-to-icon, and
role-to-label maps. `PLATFORM_ADMIN` is red, `ADMIN` amber, `OVERSIGHT` emerald,
`GRANT_HOLDER` violet, `MEMBER` sky, and `TRANSITIVE_MEMBER` indigo. An unrecognised role
renders its raw value in the neutral tone, so a new backend role is visible rather than
hidden.

**`Alert`** is `ModernAlert.vue`. It takes a meaning from `info`, `success`, `warning`,
`danger`, and `neutral`, a title through a prop or the `title` slot, body content through
its default slot, and buttons through the `actions` slot. It renders every slot
unconditionally, so a caller's content cannot be silently dropped.

**`Card`** is `VaCard`. Where a card needs a titled header, that is a slot on a wrapper,
not a second card implementation with its own radius and border. Inline panels inside a
card — a tinted callout, a summary strip — stay as Tailwind utilities at `rounded-lg`,
which is the same radius `VaCard` paints.

**`SegmentedToggle`** is `ModernButtonToggle`, the best-built component in the set: it has
a token map, `role="group"`, `aria-pressed`, and a `focus-visible` ring.

**`EmptyState`** and **`ErrorState`** own the centered block a region shows when it has
nothing to display or when a fetch failed.

`ErrorState` takes the raw `error` and a `subject` noun phrase — "this group", "these
collections". On a 401, 403, or 404 it writes its own heading and message, because a refusal
must not read as an outage and must not confirm that the resource exists. On anything else it
falls back to the caller's `title` and `message`, then to the API's own `message` from the
response body. It never shows `error.message`, which is axios's "Request failed with status
code 403". So pass the error object; a page that flattens it into a string loses the status
and gets the fallback wording.

`EmptyState` takes an `icon`, a `title`, a `message` prop or slot, and either the clear-filters affordance for a filtered region or
an `actions` slot for a create-the-first-one region. Pass `:show-clear-filters="false"`
when nothing is filtered, so the button is not offered with nothing to clear.

Call sites, for a sense of weight:

| Component | Where | Call sites |
|---|---|---|
| `ErrorState` | `components/utils/` | 33 |
| `EmptyState` | `components/utils/` | 29 |
| `Badge` | `components/v2/` | 28 |
| `ModernButtonToggle` | `components/utils/` | 17 |
| `ModernCard` | `components/utils/` | 15 |
| `ModernAlert` | `components/utils/` | 7 |
| `RoleBadge` | `components/v2/` | 6 |
| `ModernCollapsible` | `components/utils/` | 1 |

## Typography

One scale, and headings do not improvise.

| Role | Class |
|---|---|
| Page or modal title | `text-xl font-semibold` |
| Panel title | `text-lg font-semibold` |
| Empty or error state title | `text-base font-semibold` |
| Card title, section heading | `text-sm font-semibold` |
| Body | `text-sm` |
| Compact value, such as a fact's value or a quick action link | `text-xs-plus` |
| Caption, helper, tag | `text-xs` |
| Compact label, such as a small badge or the label above a fact | `text-2xs` |
| Metric value | `text-2xl font-semibold` |

Every font size is in rem. The root font size is what a user's text-size setting changes,
and a px size ignores it. Text written as `text-[11px]` stays small while the text around it
grows.

`text-2xs` (0.6875rem) and `text-xs-plus` (0.8125rem) are defined in
`ui/tailwind.config.js`. They are two deliberate steps between Tailwind's own, 11px and 13px
at the default root. Use them rather than `text-[11px]` or `text-[13px]`. Write a genuine
one-off size in rem as well, such as `text-[0.625rem]`.

A user picks Small, Medium, or Large text on the profile page. `FontSizeSelector` offers the
choice, and `ui/src/composables/useFontSize.js` saves it in local storage. `applyFontSize`
runs once from `App.vue` and sets the root font size to 100%, 110%, or 120%. The setting
belongs to the browser, not the account. Rem spacing grows with the text, including the
`13rem` sidebar, so check a new page at 120% in a 1024px window.

A heading carries a size and a weight and nothing else. Spacing utilities are fine, and so
is a color that means something, such as the red on a Danger Zone heading. An explicit
`text-gray-900 dark:text-gray-100` on a heading is not: that is the inherited color written
out again, and it is one more thing to keep in step.

Two weights only: `font-medium` for emphasis inside body text, `font-semibold` for headings
and labels. Nothing else.

Section headings are uppercased by the `uppercase` class, never by typing the label in
capitals, so the accessible name stays readable.

The dashboard hero is the one deliberate exception, at `text-3xl sm:text-4xl`. It is a
landing surface, not a resource page.

## Radius and elevation

One radius: `8px`. `--va-card-border-radius: 0.5rem` is set in
`ui/src/styles/overrides.css` so Vuestic's `6px` default matches `rounded-lg`. Use
`rounded-lg` for every panel, `rounded-md` for badges and small controls, and
`rounded-full` for avatars and pills. Do not use `rounded-xl` or `rounded-2xl`.

Depth comes from a border and a background step, not from a shadow. `shadow-sm` is the
ceiling for a resting surface and `shadow-md` for a hovered one. This is the right default
for a dense governance UI, where a shadow on every card turns into visual noise.

Do not use a gradient as a surface. It does not read as a gradient at the sizes involved.

## Spacing

The scale is `gap-1`, `gap-2`, `gap-3`, `gap-4`, `gap-6`, `gap-8`. Half steps such as
`gap-1.5` and `py-2.5` are for controls where a full step is visibly wrong, not for general
layout.

Card padding is `p-4`. Page-level horizontal padding is `px-6`. Empty and error blocks get
`py-12`.

A card's own heading is `.v2-card-title`, defined once in `ui/src/styles/main.css`. It is
uppercase, at the `text-xs` size, and widely tracked, so it reads as a section marker rather than as a second
title competing with the page's `<h1>`. A card heading is not `text-lg font-semibold`; that
size belongs to the page title alone.

**`preset="primary"` is the tinted button, not the filled one.** Vuestic's filled button is
`<VaButton>` with a `color` and no preset, which is what the page-level action on a v2 page
uses. `preset="primary"` paints a pale tint that reads as a secondary control, and
`preset="secondary"` paints no background and no border at all in this theme, so it reads as
plain coloured text. That is right for a modal footer's Cancel beside a filled Submit, and
wrong for a button standing on its own.

## The page shell

Every top-level list page uses the same shell.

- Width is not a page's choice. `ui/src/layouts/default.vue` wraps the router view in
  `.page-shell`, which caps the content column at 1440px and centres it. Every page, tab,
  and panel inside the application shell inherits that one cap. Do not add `max-w-*` plus
  `mx-auto` to a page root, a tab panel, or a card; a tab that sets its own width jumps
  the layout when the user cycles tabs, which is the defect the single cap removes. The
  class is defined in `ui/src/styles/main.css`. A `max-w-*` on a chip, a heading, or a
  truncating cell is a different thing and stays.
- The page title comes from the breadcrumb trail, and the page adds a one-line description
  below it in `text-sm va-text-secondary`. A list page does not repeat its own name as an
  `<h1>`.
- Search, filters, and the one page-level action sit in a `<VaCard class="header card">`
  above the results card.
- Loading is a skeleton inside `<Transition name="fade-slide" mode="out-in">`, matching the
  detail pages. `VaInnerLoading` is for a region that reloads inside an already-drawn page,
  not for a first paint.
- Filters are `SegmentedToggle`. `VaChip` is not a filter control; it is a removable
  selection token, which is what `DatasetGrantsTab` and `CollectionGrantsTab` use it for.
- Empty and error states are `EmptyState` and `ErrorState`. A hand-rolled
  `py-12 text-center` block is not.

`home.vue` is the exception in shape rather than in width. It is a landing surface rather
than a list, so it keeps its `DashboardHero` and its own padding, and it fills the shell's
full 1440px instead of a list page's card stack.

Detail pages agree with each other and should stay as
[V2 page patterns](./v2-page-patterns.md) describes them: a `fade-slide` transition
wrapping a skeleton, an `ErrorState`, and the loaded content; then a header row,
`<VaTabs class="border-b border-solid border-blue-500/50">`, and one panel gated by
`v-if="activeTab === '…'"`.

## Accessibility floor

**Navigation is a link.** Anything that changes the URL is a `<RouterLink>`, an `<a>`, or a
Vuestic component carrying `to`. A `<div>` with a click handler is not navigable by
keyboard, has no focus ring, and cannot be opened in a new tab. Card grids are the common
offender; `GroupCard.vue` uses `VaCard`'s `to` prop and a scoped rule that keeps the global
anchor color and hover underline off the card.

**Every interactive element is focusable and shows focus.** Prefer a Vuestic control, which
handles this. A hand-rolled control carries the shared `.focus-ring` class from
`ui/src/styles/main.css`, which paints a two-pixel `--va-primary` outline on
`:focus-visible`.

**Every icon-only control has an accessible name**, through `aria-label` or
`aria-labelledby`.

**Color is never the only signal.** A revoked grant is struck through as well as faded. An
archived resource carries a labelled badge, not only a muted tone.

## Tables

A v2 table scrolls sideways inside itself and never makes the page scroll. Every
`VaDataTable` in v2 carries the `v2-table` class, which sets `contain: inline-size`. That
property keeps the table's width out of the size of the elements around it.

Containment is needed because of two Vuestic defaults. The table sets `white-space: nowrap`,
so a long cell grows the table rather than wrapping. And `.va-inner-loading` sets
`min-width: fit-content`, so every loading wrapper grows to fit that table. `App.vue` wraps
the whole layout in one, so without containment the page grows too. Measured on a group's
Datasets tab at a 1000px window: the wrapper and `#main` were both 1440px wide.

Columns carry no `width`. The browser sizes each column to its content, and the table
stays readable at any window width.

At most one column takes the leftover width and truncates. It is the free-text column, such
as a description or tagline. Its column definition sets `tdClass: "v2-table-fill-cell"`, and
its slot renders a `block truncate` element with the full text in `title`. The class sets
`width: 100%` and `max-width: 0` on the cell. The zero maximum stops the text from sizing the
column, and the full width hands it whatever the other columns leave.

## Borders need two classes

A border color alone renders nothing, and so does `border` alone. Measured in the running
app: an element carrying `border border-gray-200` computes to `border-style: none` and
`border-top-width: 0px`, and only `border border-solid border-gray-200` computes to
`1px solid`.

Tailwind's preflight does set `border-style: solid` with `border-width: 0`. Vuestic's own
reset lands after it and zeroes both again, and it wins over the `.border` utility. That is
why [UI coding standards](./ui-coding-standards.md#use-tailwind-css-over-custom-styles)
insists on the pair. Two rounds of this defect have been found and corrected, so grep for
it when touching a panel.

## Where shared CSS lives

Five v2 files carry a `<style>` block. Everything that was copied between files is defined
once:

- **`.tab-count-badge`** — `ui/src/styles/main.css`, under `@layer components`. Four pages
  use it and none of them redefines it.
- **`.focus-ring`** — `ui/src/styles/main.css`, under `@layer utilities`.
- **`.v2-table { --va-data-table-cell-padding: 8px }`** — `ui/src/styles/overrides.css`.
  Ten v2 tables carry the class, and it also carries the containment described under
  [Tables](#tables). Six v1 files still set the variable locally, four of them
  to a different value, so they are not copies of one decision.
- **`.card.header { --va-card-padding: 0.8rem }`** — `ui/src/styles/overrides.css`.
- **`--va-card-border-radius: 0.5rem`** — `ui/src/styles/overrides.css`.

What remains local is genuinely component-specific: an `@apply` block in
`DatasetDownloadModalV2.vue`, an input height override in `ExpirySelector.vue`, a switch
track shadow in `GroupAllowMemberContribSwitch.vue`, a dropdown padding override in
`CollectionDatasetsTab.vue`, and the card padding and anchor reset in `GroupCard.vue`.

## Checklist for a new v2 component

- Does a Vuestic component or an existing primitive already do this?
- Does every color class have a `dark:` partner on the same line?
- Does every `color` prop take a meaning, with a `validator` that refuses anything else?
- Is every class name a complete literal, never built by interpolation? Tailwind cannot see
  `bg-${hue}-500`, and the class will be missing with no error and no visible failure.
- Is every border paired with `border-solid`?
- Is every font size in rem, never px?
- Do slots render unconditionally, so a caller's content cannot be silently dropped?
- Is the radius `rounded-lg`, the body text `text-sm`, and muted text at least
  `text-gray-600` in light mode?
- Does the component carry the documentation block that
  [UI coding standards](./ui-coding-standards.md#component-documentation-required)
  requires?

## What not to change

The role and group-type color mappings are consistent across every screen that shows them,
and they are the fastest way to read a governance page. The tinted-transparent badge recipe
is the right one. The detail page shape — transition, header, tabs with counts, one panel
per tab — is well settled across three resource types. Dark mode coverage is high. Density
is right for the amount of information these screens carry, and the flat, border-led
surface treatment suits it.

## Still open

Two contrast failures, neither of which has a fix that stops at a shade. `--va-primary` on
the dark page ground measures 4.49:1, one hundredth below the floor, and changing it moves
every link, active tab, and focus ring in both themes. Avatar initials measure 3.40:1
against a background generated from a hash, which needs the generator to pick from a fixed,
checked palette instead.

Three defects outside the visual layer were found while working through it, and all three
are now closed. `pages/v2/home.vue` rendered nothing, because its template read
`dashboard.loading` and its `<script setup>` never defined `dashboard`; the
[dashboard plan](/design/groups/implementation/dashboard-plan.md) fixed it. `AccessRequestReviewModal.vue`
rendered the literal text "Review Modal Stub"; the file is gone and `ReviewRequestModal.vue`
is wired in its place. The access requests page 400'd on reviewed requests, because the
route accepted only `created_at` and `updated_at` while the tab sorted by `reviewed_at`.

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

# heading recipes
grep -rhno '<h[123][^>]*class="[^"]*"' pages/v2 components/v2 \
  | sed 's/^[0-9]*://; s/.*class="//; s/"$//' | sort | uniq -c | sort -rn

# which neutral palette each file prefers
for f in $(find pages/v2 components/v2 -name '*.vue'); do
  s=$(grep -c -- '-slate-' "$f"); g=$(grep -c -- '-gray-' "$f")
  [ "$s" -gt "$g" ] && echo "SLATE $f" || { [ "$g" -gt 0 ] && echo "GRAY  $f"; }
done | sort
```

### Rendered values

Class counts describe the source. They do not describe what a user sees, because Vuestic
variables, translucent layers, and dynamically built class names all resolve at runtime.
Several of the findings above exist only at runtime.

Read them with a browser attached to a running instance. Walk every element that owns a
text node, resolve its background by blending translucent ancestors down to the body, and
compare the ratio to the WCAG floor for that font size and weight. Read `getComputedStyle`
for radius and border width rather than trusting the class list, and check
`document.styleSheets` for a rule before believing a class in the DOM does anything.

The operational detail — driving the browser past the self-signed certificate, the script
shapes that work, and the codemod traps — is in
`.claude/skills/v2-ui-changes/SKILL.md`.
