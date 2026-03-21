# Handoff: notifications privileged viewer alignment

## Done in this pass

- **UI** `ui/src/services/notifications/viewerAccess.js` — `viewerHasPrivilegedNotificationAccess(authCanOperate)` documents parity with API + auth `canOperate`. Used by `Notification.vue` (broadcast target chips) and `NotificationDropdown.vue` (`forSelf` / API path choice).
- **API** `queryService.js` — `isPrivilegedNotificationViewer(user)` centralizes admin|operator; used in `resolveNotificationForUser` (broadcast meta, global dismiss flags, resolver identity) and re-exported for routes.
- **API** extracted from `routes/notifications.js` into services:
  - `invalidation.js` — `publishNotificationInvalidation`
  - `streamHandlers.js` — `sseStreamHandler`, `requireAdminOrOperatorNotificationStream`
  - `stateUpdateHandler.js` — `updateNotificationStateHandler`
- **Route** global-dismiss guard now calls `isPrivilegedNotificationViewer(req.user)` instead of inline `hasRole` pairs.

## Invariants to preserve

- Privileged notification viewer = **admin or operator** (same as Pinia `canOperate`).
- End-users must not receive `broadcast_role_names` in JSON; chips hidden in UI via `viewerHasPrivilegedNotificationAccess` + empty `broadcast_role_names`.

## Workers

- Only `workers/workers/api.py` `create_notification` posts to the notifications API; no privilege/chip logic there.

## Follow-ups (optional)

- **Route file** still contains large inline `asyncHandler` blocks (POST create, PATCH recipients, mark-all-read, bulk delete, global dismiss). Further extraction to e.g. `notificationCommandService.js` would shrink the router further.
- **Swagger** comments on moved handlers remain on the functions in service files (`stateUpdateHandler`, `streamHandlers`); confirm swagger generator still picks them up if your pipeline scans route files only.
- Consider re-exporting `viewerHasPrivilegedNotificationAccess` from `client.js` for discoverability (not required).
