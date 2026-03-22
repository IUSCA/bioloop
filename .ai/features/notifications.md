# Notifications — feature changelog

## 2026-03-21

- **Model:** `is_read` and `is_bookmarked` live on `notification_recipient` (per user). They are not shared across users. **Withdrawal** is the shared lifecycle action (`notification.is_resolved` plus `resolved_at` / `resolved_by_id`).
- **UI:** Notification Pinia state resets on auth login/logout so list/badge/filters cannot leak across accounts in the same tab.
- **E2E:** Added `notification_cross_user_state.spec.js` — API matrix (broadcast + direct read/bookmark isolation, mark-all-read scope, withdrawal) plus UI smoke across admin/operator/user projects.

## 2026-03-21 (withdrawn visibility + terminology)

- **Terminology:** *Withdrawn* / *Withdraw* everywhere: query param `withdrawn`, list fields `withdrawal` / `can_withdraw`, route `PATCH .../withdraw`, error code `NOTIFICATION_WITHDRAWN`, and matching UI Pinia keys, `data-testid`s, and docs (no legacy global-dismiss aliases).
- **API:** Non-privileged list queries ignore `withdrawn=true` so `user` never receives `is_resolved` rows (including with read/bookmarked filters).
- **UI:** Withdrawn filter hidden for `user`; `showWithdrawnFilter` mirrors API; clear-all control has `title` + `va-popover`; secondary line `(Withdrawn by username)` when `withdrawal.withdrawn_by` is present (`data-testid` `notification-{id}-withdrawn-by`).
- **E2E:** User filter hidden + API bookmark+`withdrawn` test; admin/operator withdrawn+bookmark combo; tooltip title updates; clear-all title assertion; withdrawn-by line assertion for privileged viewers.
