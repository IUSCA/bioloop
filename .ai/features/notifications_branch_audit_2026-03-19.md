# Notifications Branch Audit (2026-03-19)

## Scope Reviewed

- API: `api/src/routes/notifications.js`, `api/src/middleware/auth.js`, `api/src/services/notificationSse.js`, `api/src/services/notificationTypeService.js`
- Data model: `api/prisma/schema.prisma`, `api/prisma/migrations/20260314160000_notifications_recipient_refactor/migration.sql`
- Producer integration: `api/src/services/dataset.js`
- UI/store: `ui/src/components/notifications/NotificationDropdown.vue`, `ui/src/components/notifications/Notification.vue`, `ui/src/stores/notification.js`, `ui/src/services/notification.js`, `ui/src/constants.js`
- Tests: `tests/src/tests/view/authenticated/notifications/*.spec.js`
- Historical intent: `.ai/features/notifications.md`, `docs/features/notifications.md` (merged global-resolve notes)

## Executive Assessment

The feature has a strong foundation (per-recipient state, global dismissal audit fields, ownership routes, live invalidation + polling fallback, and broad E2E coverage). However, there are critical concurrency holes around global dismissal invariants, plus several architectural/operational risks that will surface under load or multi-instance deployment.

Most important: current check-then-write flows can still mutate recipient state or recipients after global dismissal under real concurrency. This violates the stated rule that post-dismissal personal updates/recipient additions should conflict.

## Critical Findings

### 1) Race condition: per-user state update can succeed after global dismissal

**Where:** `api/src/routes/notifications.js` (`updateNotificationStateHandler`)

Current flow:
1. Read recipient + `notification.is_resolved`
2. If unresolved, proceed
3. Perform `notification_recipient.update(...)`

Because steps are not atomic, this sequence is possible:
- User A reads unresolved row
- Admin globally dismisses same notification
- User A update still writes `is_read`/`is_archived`/`is_bookmarked`

Result: invariant breach (action applied after dismissal), while intended behavior is `409`.

**Design gap severity:** Critical  
**Suggested fix:** Do a single conditional write (e.g., `updateMany` with `where: { notification_id, user_id, notification: { is_resolved: false } }`) and return `409` on `count=0`; or lock notification row in a transaction before update.

### 2) Race condition: recipient assignment can succeed after global dismissal

**Where:** `api/src/routes/notifications.js` (`POST /:id/recipients`)

Current flow in a transaction:
1. Read notification `is_resolved`
2. Resolve candidate recipients
3. Insert new recipients

No lock/conditional guard binds step 1 to step 3. Concurrent global dismissal can occur between read and insert.

Result: new recipients may be attached to a globally dismissed notification despite conflict requirement.

**Design gap severity:** Critical  
**Suggested fix:** lock notification row (`SELECT ... FOR UPDATE`) before checking resolved state; or perform insert via conditional SQL (`INSERT ... SELECT ... WHERE notification.is_resolved=false`) and detect zero inserts.

## High-Severity Findings

### 3) SSE architecture is single-process only

**Where:** `api/src/services/notificationSse.js`

SSE fanout is backed by in-memory `EventEmitter`. In multi-instance API deployment:
- events published on instance A are invisible to subscribers on instance B
- users receive stale views until polling catches up

The project docs already call out shared pub/sub as needed for multi-instance SSE, but branch code has not implemented that.

**Impact:** inconsistent real-time behavior, hard-to-debug "works sometimes" invalidation.  
**Suggested fix:** replace emitter fanout with Redis pub/sub (or equivalent) keyed by user ID.

### 4) SSE route permission blocks user role

**Where:** `api/src/routes/notifications.js` (`GET /stream`)

Route uses `isPermittedTo('read')` without ownership context. User role has `read:own`, not `read:any`, so users are denied stream access. UI still attempts stream and falls back to polling.

**Impact:** user role silently loses realtime behavior and is permanently on polling path.  
**Suggested fix:** add an ownership-capable permission path for stream, or explicit role allowance for stream endpoint.

### 5) Check-then-act ordering likely contributes to known chip/render regressions

**Where:** `ui/src/components/notifications/NotificationDropdown.vue`, `ui/src/stores/notification.js`

UI issues many concurrent async fetches (`fetchNotifications`, `refreshNotifications`, SSE-triggered refresh, polling refresh, filter toggles) with no request versioning/cancellation. Late responses can overwrite newer state, especially under repeated fast toggles.

This matches the observed stale/duplicate read-chip behavior documented in `.ai/features/notifications_handoff_filter_regressions_2026-03-19.md`.

**Impact:** stale controls/chips, duplicate chip DOM, intermittent test flakiness.  
**Suggested fix:** serialize notification fetches by request token/version; ignore stale responses; debounce invalidation-triggered refresh while menu is open.

## Medium Findings

### 6) "Trusted link" model is weaker than design notes

**Where:** `api/src/routes/notifications.js` (`toTrustedLink`)

External `http(s)` links are accepted and can be marked `trusted: true` via metadata. There is no allowlist enforcement at API boundary, despite earlier design language favoring strict trusted-link derivation and constrained overrides.

**Impact:** producer mistakes can create silently trusted external navigation.  
**Suggested fix:** enforce allowlist validation for `trusted=true`; reject or force `requires_confirmation=true` otherwise.

### 7) SSE auth token in query string has leakage risk

**Where:** `ui/src/components/notifications/NotificationDropdown.vue`, `api/src/middleware/auth.js`

`EventSource` uses `?token=...`. This is practical for browser SSE, but query tokens are exposed to logs/proxies/browser tooling more easily than headers/cookies.

**Impact:** elevated credential exposure surface.  
**Suggested fix:** use short-lived scoped stream token, log scrubbing, and strict TTL; optionally cookie-based auth for same-origin SSE.

### 8) `/notifications/:username/*` APIs ignore `:username` for actual targeting

**Where:** `api/src/routes/notifications.js`

Username-scoped endpoints still act on `req.user.id` only. This is safe for ownership but semantically confusing and easy to misuse by API consumers.

**Impact:** API contract ambiguity.  
**Suggested fix:** either enforce `req.params.username === req.user.username` explicitly and document, or remove redundant username path variant.

### 9) Delivery source precedence is nondeterministic for multi-role recipient resolution

**Where:** `resolveEligibleRecipients` in `api/src/routes/notifications.js`

For role-targeted delivery, first-seen role wins `delivery_role_id` for a user with multiple matching roles. Order is query-dependent, not explicit policy.

**Impact:** inconsistent role chip display and analytics interpretation.  
**Suggested fix:** define deterministic precedence (e.g., admin > operator > user) and apply consistently.

### 10) UI unread filter semantics are asymmetric

**Where:** `NotificationDropdown.vue`

- Unread toggle always forces `read=false`
- Read toggle alternates `true <-> false`
- Clear-read sets `false`

This means there is no control path for "show both read and unread" from UI, even though API can support nullable `read`.

**Impact:** discoverability/UX mismatch, hidden state model complexity.  
**Suggested fix:** make filter tri-state explicit, or explicitly document unread-first-only behavior and remove misleading toggle affordance.

### 11) Notification list scalability limits

**Where:** API + UI combined

- No pagination/windowing on notifications fetch
- Search currently client-side only over fetched set
- Badge/visible-count calculations depend on full local array

**Impact:** large recipient histories will degrade response size, dropdown render cost, and interactions.  
**Suggested fix:** add server pagination/cursor + optional server search; keep client search as fast local refinement.

## Lower-Severity Code Smells

- `removeNotification()` in `ui/src/stores/notification.js` assigns the result of `splice()` (removed elements) back to source array. This is incorrect behavior if function is ever used.
- Global `loading` state in store can over-disable unrelated controls when overlapping requests are in-flight.
- Ordering in API uses recipient row `created_at`; adding recipients later may bubble old events as "new". This may or may not match product intent.

## Edge-Case Coverage Matrix (Common Notification Patterns)

Legend: `Covered`, `Partially Covered`, `Missing`

- Concurrent per-user state update vs global dismiss -> **Partially Covered**
  - API returns `409` only when dismissal is already visible at read time
  - true check/write race still open
- Add-recipient vs global dismiss -> **Partially Covered**
  - conflict path exists
  - true race still open
- Cross-user state isolation (same notification, different recipients) -> **Covered**
  - E2E exists and validates isolation
- Idempotent global dismiss -> **Covered**
  - repeated dismiss returns successful state
- Rapid repeated filter toggling -> **Partially Covered**
  - tests exist
  - known duplicate/stale chip bug still active
- Search + filter interactions -> **Covered/Partial**
  - multiple tests exist
  - race with async refresh still possible
- Realtime invalidation fallback -> **Covered/Partial**
  - SSE + polling fallback implemented
  - user role SSE permissions and multi-instance fanout gaps
- Authorization boundaries (user cannot global dismiss/create) -> **Covered**
  - endpoints + tests present
- Untrusted external link confirmation path -> **Covered**
  - modal path exists
  - strict trust enforcement policy not fully realized
- Large notification volume behavior -> **Missing**
  - no pagination/perf protections

## Test Gaps Worth Adding Next

1. True concurrency tests (not just sequence tests):
   - state update racing global dismiss
   - recipient add racing global dismiss
2. User-role SSE stream authorization behavior test.
3. Multi-instance invalidation propagation test (or contract test around pub/sub adapter).
4. Request ordering/race test for rapid filter toggles to prevent stale response overwrite.
5. Trusted-link policy tests (allowlist + forced confirmation semantics).
6. High-volume list behavior (pagination + menu responsiveness).

## Recommended Remediation Order

1. Fix API race invariants around global dismissal (critical correctness).
2. Stabilize UI fetch concurrency model (request versioning/abort stale responses).
3. Align SSE permissions and production fanout architecture.
4. Tighten link-trust policy to match design constraints.
5. Add pagination/server search path before list size grows.

