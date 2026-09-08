---
title: V2 Design System
order: 7
---

# V2 Design System

This page states the rules new v2 UI work should follow. It is prescriptive, and it
disagrees with parts of the current code on purpose. For what is built today, see
[V2 Visual Language](./v2-visual-language.md). For the specific places the two disagree,
see [V2 Visual Language Gaps](./v2-visual-language-gaps.md).

[UI coding standards](./ui-coding-standards.md) still governs everything below the visual
layer: Tailwind over custom CSS, the documentation block on every component, auto-imports,
and the shared services. [V2 page patterns](./v2-page-patterns.md) governs capability
gating, fetching, and tab structure. This page adds the visual decisions those two leave
open.

## The layering rule

Three layers, and a component belongs to exactly one.

**Vuestic owns interactive chrome.** Buttons, inputs, selects, checkboxes, switches,
modals, tabs, data tables, pagination, and skeletons come from Vuestic. These carry focus
management, keyboard handling, and ARIA that a hand-rolled replacement will not.
Replacing one is a decision to re-implement accessibility, and it needs a reason written
down in the component's documentation block.

**A small v2 primitive set owns repeated surface.** A badge, an alert, a card, and a
segmented toggle are used often enough and styled inconsistently enough that they need to
be components rather than copied class strings. That set is defined below and should stay
small.

**Tailwind owns layout and one-off surface.** Anything not in the two layers above is
utility classes written in place.

The failure mode to avoid is the fourth layer: a class string copied between files
because no component owns it. Three of those exist today. When a class string appears in
a third file, it becomes a primitive or a rule in `main.css`.

## Color

### One neutral ramp: `gray`

Use `gray` for every neutral. Do not use `slate`, `zinc`, `neutral`, or `stone`.

The reason is not preference. Vuestic's dark preset in `ui/vuestic.config.js` already sits
on the `gray` ramp: `backgroundSecondary` and `backgroundCardPrimary` are both `#1f2937`,
which is `gray-800` exactly. Every `VaCard` in dark mode therefore paints `gray-800`. A
`slate` panel placed on it is a cooler tone on a warmer ground, and the mismatch is
structural rather than a shade away from correct.

Converging is also the contained migration. 62 v2 files are gray-dominant and 46
slate-dominant, and the slate side is almost entirely the audit subsystem and the
dashboard, so the rename touches a contiguous part of the tree.

### Semantic meaning is fixed

These mappings already hold in the code and should not be re-decided per screen.

| Meaning | Hue | Where it applies |
|---|---|---|
| Primary action, link, selection | `blue` | Buttons, tab underline, focus ring |
| Destructive, revoked, rejected, expiring | `red` | Revoke, reject, danger zone, expiry warning |
| Caution, needs attention | `amber` | Warnings, oversight banner, group admin role |
| Success, approved, granted | `emerald` | Approve, success alerts, oversight role |
| Neutral, inactive, archived | `gray` | Archived chips, disabled state, system tags |

Four hues carry no general meaning and stay reserved for the identity they already encode:
`violet` for grant holder and `project` groups, `sky` for member, `indigo` for transitive
member, `teal`, `orange`, and `rose` for the `lab`, `center`, and `core` group types.

Two rules follow. Do not introduce `green` where `emerald` means success, and do not
introduce `rose` where `red` means danger. Each pair currently appears in both forms and
the difference carries no information.

### Do not name a raw hue at a call site

A component's `color` prop takes a meaning, not a hue. `color="danger"`, not
`color="rose"`. The hue is the primitive's business.

This is the rule `ModernButtonToggle` and `ModernAlert` break today, and it is why
`color="blue"` silently renders green.

### Refuse an unknown color rather than falling back

A `color` prop takes a `validator` listing the values it accepts. An unrecognised value
fails loudly in development instead of resolving to whatever the fallback happens to be.
This follows the repository's standing rule that a missing entry in a lookup table is a
gap to report, not a value to guess.

### Every color class has a dark variant

Write the pair together, on the same line, every time:
`text-gray-600 dark:text-gray-400`. Reviewers can then see a missing variant without
running anything. Current coverage is good — 723 of 1,533 color utilities carry `dark:` —
and the rule keeps it that way.

Two conventions carry the dark palette. Solid surfaces step from `bg-white` or
`bg-gray-50` to `dark:bg-gray-800`. Tinted panels step from `bg-{hue}-50` to
`dark:bg-{hue}-900/20`, using opacity rather than a darker shade, so one rule covers every
hue.

### Contrast is a floor, not a goal

Body text meets WCAG AA: 4.5:1 for normal text, 3:1 at 24px or at 18.66px bold. This
holds in both themes and against the surface the text actually sits on, not against white.

Three shades fail that floor on the surfaces v2 puts them on, and they should not be used
for light-mode text: `text-gray-400` at 2.54:1 on white, `text-slate-400` at 2.56:1, and
Vuestic's `va-text-secondary` at 4.19:1. Use `text-gray-600 dark:text-gray-400` for muted
text instead, which measures 7.56:1 on white and 5.78:1 on a `gray-800` card.

`text-gray-500` is the borderline case. It clears the floor on a white card at 4.83:1 and
misses it on the `#F4F6F8` page ground at 4.46:1, so it is safe inside a card and not
outside one.

`text-gray-400` remains fine as a `dark:` value and as an icon color where the icon is
decorative.

## The primitive set

Four components, and adding a fifth needs an argument.

**`Badge`** replaces the three recipes in use. One recipe: tinted-transparent, because it
reads on both themes without a second color decision.

```
text-{hue}-700 bg-{hue}-500/10 dark:text-{hue}-400 dark:bg-{hue}-400/10
inline-flex items-center gap-1 rounded-md px-1.5 py-0.5
text-[11px] font-semibold uppercase tracking-wide
```

It takes a meaning, a size from `sm`, `base`, `lg`, and an optional icon. The two role
badges become configuration passed to it rather than two components.

**`Alert`** takes a meaning, a title, and body content through its default slot. It
renders the slot unconditionally. It carries `border border-solid` so its border color
classes do something.

**`Card`** is `VaCard`. Hand-rolled panels stop existing. Where a card needs a titled
header, that is a slot on a wrapper, not a second card implementation with its own radius
and border.

**`SegmentedToggle`** is today's `ModernButtonToggle`, which is the best-built component
in the set: it has a token map, `role="group"`, `aria-pressed`, and a `focus-visible`
ring. Keep it, and change its `color` prop to take meanings.

## Typography

One scale, and headings do not improvise.

| Role | Class |
|---|---|
| Page title | `text-xl font-semibold` |
| Section heading | `text-sm font-semibold uppercase tracking-wide` |
| Card title | `text-sm font-semibold` |
| Body | `text-sm` |
| Caption, helper, tag | `text-xs` |
| Metric value | `text-2xl font-semibold` |

Two weights only: `font-medium` for emphasis inside body text, `font-semibold` for
headings and labels. Nothing else.

Section headings are uppercased by the `uppercase` class, never by typing the label in
capitals, so the accessible name stays readable.

The dashboard hero is the one deliberate exception, at `text-3xl sm:text-4xl`. It is a
landing surface, not a resource page.

## Radius and elevation

One radius: `8px`. Set `--va-card-border-radius: 0.5rem` in
`ui/src/styles/overrides.css` so Vuestic's `6px` default matches `rounded-lg`, then use
`rounded-lg` for every panel, `rounded-md` for badges and small controls, and
`rounded-full` for avatars and pills.

Depth comes from a border and a background step, not from a shadow. `shadow-sm` is the
ceiling for a resting surface and `shadow-md` for a hovered one. This is already how the
code behaves, with 18 shadow classes in 128 files, and it is the right default for a dense
governance UI where a shadow on every card turns into visual noise.

Do not use a gradient as a surface. Two components do, and neither reads as a gradient at
the sizes involved.

## Spacing

The scale is `gap-1`, `gap-2`, `gap-3`, `gap-4`, `gap-6`, `gap-8`. Half steps such as
`gap-1.5` and `py-2.5` are for controls where a full step is visibly wrong, not for
general layout.

Card padding is `p-4`. Page-level horizontal padding is `px-6`. Empty and error blocks get
`py-12`.

## The page shell

Every top-level v2 page uses the same shell. The five that exist today use four.

- Width is `max-w-7xl mx-auto`, set once in the page.
- The page title comes from the breadcrumb trail, and a list page adds a one-line
  description below it. A list page does not repeat its own name as an `<h1>`.
- Loading is a skeleton inside `<Transition name="fade-slide" mode="out-in">`, matching
  the detail pages. `VaInnerLoading` is for a region that reloads inside an already-drawn
  page, not for a first paint.
- Filters are `SegmentedToggle`. `VaChip` is not a filter control.
- Empty and error states are `EmptyState` and `ErrorState`. A hand-rolled `py-12
  text-center` block is not.

Detail pages already agree with each other and should stay as
[V2 page patterns](./v2-page-patterns.md) describes them.

## Accessibility floor

Four rules, all of which v2 currently breaks somewhere.

**Navigation is a link.** Anything that changes the URL is a `<RouterLink>` or an `<a>`.
A `<div>` with a click handler is not navigable by keyboard, has no focus ring, and cannot
be opened in a new tab. Card grids are the common offender.

**Every interactive element is focusable and shows focus.** Prefer a Vuestic control,
which handles this. A hand-rolled control carries a `focus-visible` ring.

**Every icon-only control has an accessible name**, through `aria-label` or
`aria-labelledby`.

**Color is never the only signal.** A revoked grant is struck through as well as faded. An
archived resource carries a labelled chip, not only a muted tone.

## Checklist for a new v2 component

- Does a Vuestic component or an existing primitive already do this?
- Does every color class have a `dark:` partner on the same line?
- Does every `color` prop take a meaning, with a `validator` that refuses anything else?
- Is every class name a complete literal, never built by interpolation? Tailwind cannot
  see `bg-${hue}-500`, and the class will be missing with no error.
- Is every border paired with `border-solid`?
- Do slots render unconditionally, so a caller's content cannot be silently dropped?
- Is the radius `rounded-lg`, the body text `text-sm`, and muted text at least
  `text-gray-600` in light mode?
- Does the component carry the documentation block that
  [UI coding standards](./ui-coding-standards.md#component-documentation-required)
  requires?

## What not to change

The parts of the v2 look that are working, and that a redesign should leave alone.

The role and group-type color mappings are consistent across every screen that shows them,
and they are the fastest way to read a governance page. The tinted-transparent badge
recipe is the right one to standardise on. The detail page shape — transition, header,
tabs with counts, one panel per tab — is well settled across three resource types. Dark
mode coverage is already high. Density is right for the amount of information these
screens carry, and the flat, border-led surface treatment suits it.

The visual language does not need replacing. It needs one neutral ramp, one badge, one
alert, one card, and one page shell.
