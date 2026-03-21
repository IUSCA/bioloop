/**
 * Notification feature: admin and operator share the same elevated UX and API paths
 * (non-ownership routes, global dismiss, SSE `/notifications/stream`, broadcast target chips).
 *
 * Keep in sync with API `isPrivilegedNotificationViewer` in
 * `api/src/services/notifications/queryService.js` and with auth store `canOperate`
 * (`hasRole('operator') || hasRole('admin')`).
 *
 * @param {boolean} authCanOperate - Unwrapped Pinia `canOperate` (use `storeToRefs` + `.value`)
 * @returns {boolean}
 */
export function viewerHasPrivilegedNotificationAccess(authCanOperate) {
  return Boolean(authCanOperate);
}
