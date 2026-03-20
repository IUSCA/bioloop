# Notifications Filter Regressions Handoff (2026-03-19)

## Scope requested by user

- Fix filter/chip sync regressions and runtime errors in notification dropdown.
- Add/adjust E2E for all reported cases without duplicating existing tests.
- Keep failures honest (no skip/fixme/hiding).
- Also complete visual polish requests (colors, icons, full-width controls).

## What is already implemented

### UI

- `ui/src/components/notifications/NotificationDropdown.vue`
  - Notification row keys changed to stable `:key="notification.id"` (was index).
  - Top controls moved to full-width grid.
  - Added visible count label (`data-testid="notification-visible-count"`).
  - Added active filter chip test IDs:
    - `active-filter-chip-read`
    - `active-filter-chip-archived`
    - `active-filter-chip-bookmarked`
    - `active-filter-chip-globally-dismissed`
    - `active-filter-chip-search`
  - Filter chips are custom rendered now (small, close icon, color classes).
  - Centralized chip clear handler now uses `onFilterChipClear(chip.id)`.
  - Read/bookmark/archive/global-dismissed/search chip clear paths all route to explicit clear functions.
  - Top filter buttons now use centralized theme colors/icons and full width.
  - Search input remains full width.

- `ui/src/components/notifications/Notification.vue`
  - Per-notification state action buttons are full-width and color/icon-coded.
  - Business links use distinct primary styling and icon.
  - Delivery chips (`Direct`, `Role Broadcast`, role chip) now have differentiated colors.

- `ui/src/services/notificationTheme.js` (new)
  - Central color/icon mapping for filters, delivery chips, and notification actions.

### Seed script

- `api/src/scripts/seed-notifications.js`
  - Added role-combo broadcast seed definitions:
    - admin + user
    - operator + user
    - admin + operator
    - admin + operator + user
  - Added `role_combo` targeting support in recipient builder.
  - Added per-notification visual prefix in text:
    - `(test notification #<notification_id>) ...`

### E2E additions/updates

- `tests/src/tests/view/authenticated/notifications/non_user_role_notifications.spec.js`
  - Added tests (new):
    - `notification count indicator changes when filters change`
    - `read filter toggles chip cleanly with no duplicates`
    - `filter buttons stay synced with filter chips and no hierarchy errors`
  - Existing tests updated to new active-chip selectors.
  - Existing strict SSE and cross-user tests retained.

- `tests/src/tests/view/authenticated/notifications/user_role_notifications.spec.js`
  - Updated chip-clear selectors to active-chip model.

## Current blocker (critical)

### Failing test (still failing honestly)

- Project: `admin_notifications`
- Test: `read filter toggles chip cleanly with no duplicates`
- Failure: after clicking `active-filter-chip-read`, chip remains visible (`count 1` expected `0`).

### Why this is important

- This matches the user-reported persistent bug: read chip not clearing / duplicate behavior.
- Must be fixed before claiming completion.

## Signals gathered during debugging

- UI state probe showed `filters.read` can flip to `false` while a visible read chip still remains.
- This suggests one of:
  1. stale DOM not reconciling in current menu instance,
  2. interaction hitting a different rendered instance than the one used for assertions,
  3. another render path reintroducing chip immediately.
- No deterministic `HierarchyRequestError` reproduced in the same focused failing test run; however user previously reported it in mixed filter combos and test coverage for that case is present and should remain.

## Recommended next steps for next agent

1. **Isolate rendered menu instance**
   - Scope all chip/filter interactions to the same visible menu container instance.
   - Verify if more than one `notification-menu-items` subtree is visible/rendered by `va-menu` teleport behavior.

2. **Instrument chip lifecycle minimally**
   - Temporarily log `filters.read`, `activeFilterChips`, and menu instance identifiers on:
     - read button click
     - chip clear click
     - each refreshNotifications call
   - Confirm whether chip is not removed vs removed+re-added.

3. **Validate clear path**
   - Confirm `onFilterChipClear('read')` always executes.
   - Confirm clear function sets store and does not get overwritten by another callback.

4. **Reconcile duplicate-instance risk**
   - If `va-menu` content is duplicated/teleported, ensure test IDs are unique per open menu instance or scope selectors to one subtree.

5. **Re-run tests in order**
   - First:
     - `read filter toggles chip cleanly with no duplicates`
   - Then:
     - `filter buttons stay synced with filter chips and no hierarchy errors`
     - `notification count indicator changes when filters change`
   - Then full notification projects.

## Commands used most recently

```bash
TEST_BASE_URL=https://localhost:14443 TEST_API_BASE_URL=https://localhost:14443/api TEST_DIRECT_API_BASE_URL=http://localhost:14303 npx playwright test --project=admin_notifications --grep "read filter toggles chip cleanly with no duplicates"
```

```bash
TEST_BASE_URL=https://localhost:14443 TEST_API_BASE_URL=https://localhost:14443/api TEST_DIRECT_API_BASE_URL=http://localhost:14303 npx playwright test --project=admin_notifications --grep "notification count indicator changes when filters change|read filter toggles chip cleanly with no duplicates|filter buttons stay synced with filter chips and no hierarchy errors"
```

## Continuation attempt update (latest)

### What was changed in this continuation

- `ui/src/components/notifications/NotificationDropdown.vue`
  - Active-filter chips were refactored from a dynamic `v-for` list to explicit per-filter chip blocks (`Read`, `Archived`, `Bookmarked`, `Globally Dismissed`, `Search`).
  - Chip clear interactions now use dedicated close buttons with explicit test IDs:
    - `active-filter-chip-read-clear`
    - `active-filter-chip-archived-clear`
    - `active-filter-chip-bookmarked-clear`
    - `active-filter-chip-globally-dismissed-clear`
    - `active-filter-chip-search-clear`
  - Read-filter setter path now routes through `applyReadFilter(...)`.
  - Filter toggles/chip clears now call `fetchNotifications(...)` (instead of `refreshNotifications(...)`) to avoid extra unread-count refresh churn while interacting in-menu.

- `ui/src/stores/notification.js`
  - `setFilter(...)` changed from in-place mutation to immutable object replacement.
  - `clearFilters()` changed to replace the full filters object.

- `tests/src/tests/view/authenticated/notifications/non_user_role_notifications.spec.js`
  - Chip clear interactions updated to target new close-button test IDs.

- `tests/src/tests/view/authenticated/notifications/user_role_notifications.spec.js`
  - Chip clear interactions updated to target new close-button test IDs.

### Current blocker status (still failing honestly)

- Failing test remains:
  - Project: `admin_notifications`
  - Test: `read filter toggles chip cleanly with no duplicates`
- Failure modes observed:
  1. `Read` chip remains visible after clear click (`expected 0, received 1`)
  2. In some runs, duplicate visible `Read` chips appear after a single enable (`expected 1, received 2`)

### Strong diagnostic signal found

- A direct Playwright probe shows:
  - `read` state transitions to `false` after chip clear request path.
  - Network requests after clear include `read=false` (clear path is actually executed).
  - Despite that, DOM still shows one or more `active-filter-chip-read` elements.
- This strongly suggests a render-layer DOM reconciliation issue (stale/duplicated chip nodes), not just filter-state assignment logic.

### Suggested next steps (high priority)

1. Build a minimal repro with one open menu instance and capture DOM mutation events on the chip container:
   - compare node insert/remove for `[data-testid="active-filter-chip-read"]`
   - verify whether old nodes are removed or leaked.
2. Check whether Vuestic `va-menu`/teleport interaction is duplicating menu-content subtree under rapid updates:
   - inspect all ancestors of each chip node and compare tree paths.
3. Temporarily disable polling and SSE invalidation while menu is open and filter controls are being used:
   - if chip leak stops, re-introduce refresh in controlled debounce/serialized path.
4. If teleport/content reconciliation remains unstable:
   - move active-chip UI out of the teleported menu subtree (or
   - force full remount of chip container using a deterministic render key tied to filters snapshot).

### Validation run in this continuation

- Repeatedly run:
  - `TEST_BASE_URL=https://localhost:14443 TEST_API_BASE_URL=https://localhost:14443/api TEST_DIRECT_API_BASE_URL=http://localhost:14303 npx playwright test --project=admin_notifications --grep "read filter toggles chip cleanly with no duplicates"`
- Result: still failing (no skip/fixme introduced).

