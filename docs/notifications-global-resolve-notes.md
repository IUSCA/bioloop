# Notifications Global Resolve Notes

## Scope

This document captures agreed suggestions, edge cases, and implementation guidance for adding global notification dismissal on top of the per-recipient notifications model.

## Baseline Model

- `notification` is the global event.
- `notification_recipient` is per-user delivery/state (`is_read`, `is_archived`, `is_bookmarked`).
- Global dismissal is event-level lifecycle, distinct from per-user state.

## Previously Identified Edge Cases and Handling

1. Race: user toggles read/unread while admin globally dismisses
   - API returns `409 Conflict` for stale per-user update attempts when event is already globally dismissed.
   - UI reaction: show toast indicating notification is no longer actionable and refresh notifications list.

2. Race: recipient assignment after global dismissal
   - API returns `409 Conflict` when attempting to add recipients to already globally dismissed notification.
   - UI reaction: show toast with clear message and refresh source list/form.

3. Role/permission drift
   - Persist `resolved_by_id` and `resolved_at` for audit trail even if resolver role changes later.

4. Filter interaction semantics
   - Default unread list excludes globally dismissed notifications.
   - Add explicit "Globally Dismissed" filter to view them.

5. Unread badge consistency
   - Badge calculation excludes globally dismissed notifications.
   - Polling provides eventual consistency; near-real-time update can be added with SSE.

6. Idempotency
   - Re-dismissing an already dismissed notification should be idempotent (`200` no-op) or explicit conflict (`409`); choose one and keep it consistent.

7. Authorization boundaries
   - Non-admin/non-operator users must be blocked from global dismissal (`403`).
   - Server authorization is authoritative; UI visibility is convenience only.

## Additional Agreed Requirements

- Notification UI must visibly indicate delivery source:
  - Role-targeted broadcast
  - Direct user-targeted
- Users can filter to view globally dismissed notifications only.
- Resolver identity visibility:
  - Admin/operator viewer: show who globally dismissed.
  - User viewer: do not show resolver identity.
- Global dismissal permissions:
  - Allowed: admin, operator
  - Not allowed: user role
- Personal notification state changes (read/unread, archive, bookmark):
  - Use username-scoped ownership endpoints with `checkOwnership` in API.

## API Behavior Expectations

- Per-user state update on globally dismissed notification: `409 Conflict`
- Recipient assignment to globally dismissed notification: `409 Conflict`
- Unauthorized global dismissal: `403 Forbidden`

Recommended error body shape:

```json
{
  "code": "NOTIFICATION_GLOBALLY_DISMISSED",
  "message": "Notification is globally dismissed and no longer actionable."
}
```

## Real-Time Update Options for Global Dismissal

### Option A: Keep Polling Only (current pattern)

Pros:
- Lowest complexity
- No connection lifecycle management
- Works with current architecture

Cons:
- Delay until next poll interval
- Extra repeated API traffic

Complexity:
- Low implementation, low maintenance

### Option B: SSE (Server-Sent Events)

Pros:
- Good fit for one-way server-to-client events (global dismissal broadcasts)
- Simpler than WebSockets
- Native browser `EventSource` support

Cons:
- Need connection management and reconnect handling
- In multi-instance deployment, requires shared pub/sub (Redis or equivalent) for fan-out
- Some infra/proxy tuning needed for long-lived HTTP connections

Complexity:
- Medium implementation, medium maintenance

### Option C: WebSockets

Pros:
- Full duplex communication
- Suitable if roadmap includes rich bi-directional real-time features

Cons:
- More moving parts than needed for current one-way notification updates
- Higher ops burden (connection scaling, heartbeat, auth refresh)

Complexity:
- High implementation, high maintenance

## Recommendation

- For this feature scope, prefer:
  1. Keep polling as baseline.
  2. Add SSE only for global dismissal push if near-real-time UX is required.
  3. Avoid WebSockets unless broader real-time requirements are planned.

- If SSE is adopted:
  - Push only minimal event payloads (notification id + event type).
  - Client refetches notifications list after receiving event.
  - Keep polling as fallback if SSE disconnects.

## E2E Test Scenarios to Add

- Non-admin/non-operator attempts global dismissal -> `403` surfaced in UI.
- Admin globally dismisses while another user has notification open:
  - second user action returns `409`
  - UI refreshes and notification disappears from unread.
- Recipient assignment after global dismissal -> `409` + UI toast.
- Resolver identity visibility:
  - visible to admin/operator
  - hidden for user-role viewer.
- "Globally Dismissed" filter shows dismissed notifications and excludes active ones.
