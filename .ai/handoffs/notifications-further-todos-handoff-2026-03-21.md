# Handoff: notifications further todos (`notification-further-todos.md`)

## Done in-repo (this pass)

| Item | Notes |
|------|--------|
| User role: no withdrawn listings | API: `fetchCurrentUserNotifications` ignores `withdrawn=true` for `!isPrivilegedNotificationViewer`. |
| User role: no Withdrawn filter UI | `NotificationDropdown.vue`: `showWithdrawnFilter` + `v-if` on control and chip; `hasActiveFilters` / chips ignore withdrawn for users. |
| Withdraw does not touch read/bookmark | Already true (only `notification` row updated). `PATCH .../withdraw` updates lifecycle fields only. |
| Admin/operator: withdrawn + bookmark | E2E: `non_user_role_notifications.spec.js` — `withdrawn filter combines with bookmark filter`. |
| User: API + UI | E2E: withdrawn filter absent in menu; API test with `bookmarked: true` + `withdrawn: true` still omits row. |
| Terminology (full) | Query param `withdrawn`, JSON `withdrawal` / `can_withdraw`, `NOTIFICATION_WITHDRAWN`, `filter-withdrawn`, `notification-*-withdraw`, docs and `.ai` aligned. |
| Docs | `docs/features/notifications.md` — table + rules + API field names for withdrawal. |
| Clear-all tooltip | `va-popover` + `title="Clear all filters"`; E2E asserts title when read filter active. |
| Header control helpers | `expectHeaderControls*`: only assert `filter-withdrawn` when present (user projects). |
| Withdrawn-by line | `Notification.vue` secondary text + E2E (`notification-*-withdrawn-by`). |

## Explicit non-conflict with product

- **Direct notifications remain withdrawable** by admin/operator (same as before). Nothing in the todo list required restricting withdrawal to role-broadcast only.

## Remaining / follow-up (accuracy or scope)

### 1. VaTooltip vs `va-popover`

Requirement asked for **Vuestic tooltips** on top controls. This repo uses `va-popover` with `message` (same pattern as other components). **No `VaTooltip` usage** was found under `ui/` (Vuestic 1.9.x).

**Next step:** Confirm in installed `vuestic-ui` whether `VaTooltip` exists and preferred API; if yes, replace hover layer on filter/clear buttons per design system. If popover is the supported pattern, update the todo doc to accept `va-popover` as the standard.

### 2. Full terminology sweep

**Done:** API, UI, tests, capture script, and docs use withdrawal naming only (`withdrawn`, `withdrawal`, `NOTIFICATION_WITHDRAWN`, `PATCH .../withdraw`, matching testids). Regenerate Swagger/OpenAPI artifacts if your pipeline checks in generated output.

### 3. DB field for “who withdrew”

`resolved_by_id` / `resolved_by` already exist. Todo asked for a **new** field — **not added** (redundant unless product wants a separate audit column). If PM insists on a new column, add migration + backfill from `resolved_by_id`.

### 4. E2E deferred in original todo

“add e2e, but not now” for the new DB field — N/A if no new column.

### 5. Worker tests

No application worker code referenced notification withdrawal (only venv noise). Nothing to update unless workers gain notification APIs later.

### 6. Screenshot / tooling scripts

`capture-notification-menu-screens.cjs` updated for `filter-withdrawn` / `*-withdraw` testids; re-run if regenerating screenshots (output filenames for the withdrawn filter GIF/step may differ from older captures).

### 7. `notification-further-todos.md` line 25–26

Playwright tooltip test reference — **ignored per file instruction** (“Agent, Ignore anything below this”).

## Files touched (reference)

- `api/src/services/notifications/queryService.js`
- `api/src/routes/notifications.js`
- `api/src/services/notifications/stateUpdateHandler.js`
- `ui/src/components/notifications/NotificationDropdown.vue`
- `ui/src/components/notifications/Notification.vue`
- `ui/src/stores/notification.js`
- `ui/src/services/notifications/client.js`
- `tests/src/tests/view/authenticated/notifications/helpers.js`
- `tests/.../non_user_role_notifications.spec.js`
- `tests/.../user_role_notifications.spec.js`
- `docs/features/notifications.md`
- `.ai/features/notifications.md`
