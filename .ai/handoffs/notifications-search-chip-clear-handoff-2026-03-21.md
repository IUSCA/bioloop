# Notifications Search Chip Clear - Handoff (2026-03-21)

## Problem Statement

Search filter chip does not disappear after clicking its clear button in notification dropdown.

Observed behavior:
- Search input clears (`''`)
- Search chip remains visible with previous text (e.g., `Search: abc123`)

Expected behavior:
- Clearing search chip removes chip immediately
- No duplicate/stale chips remain

This appears related to the earlier status-chip stale rendering class of issue.

## Repro Command

Run from `tests/`:

`TEST_BASE_URL='https://localhost:24443' TEST_API_BASE_URL='https://localhost:24443/api' npx playwright test src/tests/view/authenticated/notifications/non_user_role_notifications.spec.js --project=admin_notifications --grep "search chip clears via chip clear control"`

Current result:
- 1 failed, 1 passed
- Failing assertion: chip still visible after clear

## Failing Assertion

File: `tests/src/tests/view/authenticated/notifications/non_user_role_notifications.spec.js`

```js
await menu.getByTestId('active-filter-chip-search-clear').click();
await expect(searchInput(page)).toHaveValue('');
await expectSearchFilterChipHidden(menu);
```

Helper assertion in `tests/src/tests/view/authenticated/notifications/helpers.js`:

```js
const expectSearchFilterChipHidden = async (menu, { timeout = 15000 } = {}) => {
  await expect(menu.getByTestId('active-filter-chip-search')).toBeHidden({ timeout });
};
```

## Current Relevant UI Code

File: `ui/src/components/notifications/NotificationDropdown.vue`

Current notable points:
- Search input is `v-model="searchInput"` (computed getter/setter backed by store filter)
- Search chip row is keyed with `filterChipsRenderKey`
- Chip clear calls `clearSearchFilter()`
- `clearSearchFilter()` currently:
  - sets `ignoreSearchEchoUntilInput = true`
  - calls `setFilter("search", "")`
  - triggers `fetchNotifications(...)`

Search chip render condition:

```vue
v-if="searchInput.trim()"
```

## What Was Tried (and why it is not final)

Tried multiple variants to isolate stale DOM/state behavior:
- Input remount key approach
- Panel remount key approach
- Explicit local `showSearchChip` flag
- Temporary runtime debug instrumentation to collect clear-event timeline

Results:
- Some variants reduced related flakiness
- None resolved the core failing assertion consistently in this environment
- Panel remount introduced regressions while typing (removed)

Important: no timeout-based workaround is considered acceptable final fix.

## Useful Runtime Finding

A debug run showed:
- `clearSearchFilter` executes
- store search value becomes empty (`''`)
- chip text remains stale in visible menu

This suggests stale rendered state/instance mismatch in dropdown/menu context, not simply "clear handler not called".

## Suggested Clean Next Steps (No Hacks)

1. **Unify source of truth for chip text and visibility**
   - Ensure chip uses one authoritative, post-commit state (not mixed local + store pathways).
   - Avoid local mirrors unless strictly derived and synchronized in one place.

2. **Inspect menu instance ownership**
   - Confirm chip and input are in same active menu instance.
   - Validate no stale teleported panel remains "visible" to locator after state updates.

3. **Tighten component update boundaries**
   - If keyed remount is needed, scope it strictly to chip container (already attempted) and verify with instance identity checks.
   - Avoid remounting full panel/input.

4. **After fix, run this sequence**
   - Focused failing grep command above
   - Then broader notification set:
     - `notification_keyboard_a11y.spec.js`
     - `non_user_role_notifications.spec.js`

## Other Context

Repo has many unrelated local changes in this branch/worktree. Avoid touching unrelated files.

Primary files touched in this thread:
- `ui/src/components/notifications/NotificationDropdown.vue`
- `ui/src/components/notifications/Notification.vue`
- `tests/src/tests/view/authenticated/notifications/helpers.js`
- `tests/src/tests/view/authenticated/notifications/non_user_role_notifications.spec.js`
- `tests/src/tests/view/authenticated/notifications/notification_keyboard_a11y.spec.js`

